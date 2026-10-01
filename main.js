const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// ---- Mode: "permainan" (biasa) atau "kalibrasi" (shortcut dengan --kalibrasi)
const MODE = process.argv.includes('--kalibrasi') ? 'kalibrasi' : 'permainan';

// ---- Lokasi folder backtrack/
// Saat dicoba (npm start): di folder proyek.
// Saat sudah jadi exe: di samping file exe-nya.
const BASE = app.isPackaged
  ? (process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath))
  : __dirname;
const FOLDER_LAGU = path.join(BASE, 'backtrack');

// Suara dari piezo bukan "klik pengguna", jadi tanpa ini Chromium bisa menahan bunyinya
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// ---- Memindai backtrack/: hanya mp3 yang punya pasangan json yang valid
function bacaDaftarLagu() {
  if (!fs.existsSync(FOLDER_LAGU)) return [];
  const hasil = [];
  for (const f of fs.readdirSync(FOLDER_LAGU)) {
    if (!/\.mp3$/i.test(f)) continue;
    const id = f.replace(/\.mp3$/i, '');
    const fileJson = path.join(FOLDER_LAGU, id + '.json');
    if (!fs.existsSync(fileJson)) {
      console.log('Lewati (tidak ada ' + id + '.json): ' + f);
      continue;
    }
    try {
      const data = JSON.parse(fs.readFileSync(fileJson, 'utf8'));
      hasil.push({
        id,
        data,
        audioUrl: pathToFileURL(path.join(FOLDER_LAGU, f)).href
      });
    } catch (e) {
      console.log('Lewati (JSON rusak): ' + id);
    }
  }
  hasil.sort((a, b) => a.id.localeCompare(b.id));
  return hasil;
}

ipcMain.handle('app:info', () => ({ mode: MODE, folderLagu: FOLDER_LAGU }));
ipcMain.handle('lagu:daftar', () => bacaDaftarLagu());

// ---- Aturan penyimpanan lagu ----
// Simbol sah: titik, 1-7, 6 rendah (_6), dan versi bergong dengan kurung
// Karakter font Kepatihan yang lebarnya nol (pengubah: gong, titik, garis, dll.)
const ZW = '*+-/89=>?AGSXZ\\abcgjklmnpsvxz|';
// Satu not = 1-6 karakter font, minimal satu karakter dasar. Bentuk lama tetap diterima.
function notSah(n) {
  if (typeof n !== 'string') return false;
  if (/^(\.|[1-7]|_6|\((?:[1-7]|_6)\))$/.test(n)) return true;
  return /^[\x21-\x7e]{1,6}$/.test(n) && [...n].some(c => !ZW.includes(c));
}

// Nama lagu: huruf kecil, angka, strip. Spasi jadi strip, karakter lain dibuang.
function bersihkanNama(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-/, '')
    .slice(0, 60)
    .replace(/-$/, '');
}

// Mengembalikan teks galat, atau null bila lagu sah
function periksaLagu(d) {
  if (!d || typeof d !== 'object') return 'Data lagu kosong';
  if (typeof d.judul !== 'string' || !d.judul.trim()) return 'Judul belum diisi';
  if (!Array.isArray(d.baris) || d.baris.length === 0) return 'Notasi masih kosong';
  let tTerakhir = -Infinity;
  for (let i = 0; i < d.baris.length; i++) {
    const b = d.baris[i];
    if (!b || !Array.isArray(b.gatra) || b.gatra.length === 0) return 'Baris ' + (i + 1) + ': tidak ada gatra';
    for (let j = 0; j < b.gatra.length; j++) {
      const g = b.gatra[j];
      const lokasi = 'Baris ' + (i + 1) + ', gatra ' + (j + 1);
      if (!g || typeof g.t !== 'number' || !isFinite(g.t) || g.t < 0) return lokasi + ': waktu "t" tidak valid';
      if (g.t < tTerakhir) return lokasi + ': waktu mundur (lebih kecil dari gatra sebelumnya)';
      tTerakhir = g.t;
      if (!Array.isArray(g.not) || g.not.length === 0) return lokasi + ': tidak ada not';
      for (const n of g.not) {
        if (!notSah(n)) return lokasi + ': not tidak dikenal (' + n + ')';
      }
      if (g.waktu !== undefined) {
        const bagus = Array.isArray(g.waktu) && g.waktu.length === g.not.length &&
          g.waktu.every(w => typeof w === 'number' && isFinite(w));
        if (!bagus) return lokasi + ': "waktu" harus angka dan jumlahnya sama dengan "not"';
      }
    }
  }
  return null;
}

// Tulis ke berkas sementara dulu, baru ganti nama (lagu lama tidak rusak bila mati di tengah)
function tulisAman(tujuan, isi) {
  const sementara = tujuan + '.tmp';
  fs.writeFileSync(sementara, isi, 'utf8');
  fs.renameSync(sementara, tujuan);
}

// ---- Memilih mp3 lewat dialog. Alamat file diingat di sini (bukan di halaman).
let audioTerpilih = null;
ipcMain.handle('audio:pilih', async (event) => {
  const jendela = BrowserWindow.fromWebContents(event.sender);
  const r = await dialog.showOpenDialog(jendela, {
    title: 'Pilih file backing track (mp3)',
    properties: ['openFile'],
    filters: [{ name: 'MP3', extensions: ['mp3'] }]
  });
  if (r.canceled || !r.filePaths.length) return { ok: false, batal: true };
  const alamat = r.filePaths[0];
  if (!/\.mp3$/i.test(alamat)) return { ok: false, pesan: 'File harus berformat mp3' };
  audioTerpilih = alamat;
  const nama = path.basename(alamat);
  return {
    ok: true,
    nama: nama,
    saranNama: bersihkanNama(nama.replace(/\.mp3$/i, '')),
    url: pathToFileURL(alamat).href
  };
});

// ---- Menyimpan lagu. Menerima { nama, data, timpa }.
// Lagu baru tidak boleh menimpa lagu yang sudah ada. mp3 pilihan dialog ikut disalin.
ipcMain.handle('lagu:simpan', (event, p) => {
  try {
    const { nama, data, timpa } = p || {};
    const id = bersihkanNama(nama);
    if (!id) return { ok: false, pesan: 'Nama lagu tidak valid (pakai huruf, angka, strip)' };
    const salah = periksaLagu(data);
    if (salah) return { ok: false, pesan: salah };
    fs.mkdirSync(FOLDER_LAGU, { recursive: true });
    const fileJson = path.join(FOLDER_LAGU, id + '.json');
    const fileMp3 = path.join(FOLDER_LAGU, id + '.mp3');
    if ((fs.existsSync(fileJson) || fs.existsSync(fileMp3)) && !timpa) {
      return { ok: false, pesan: 'Lagu "' + id + '" sudah ada' };
    }
    // Salin mp3 yang dipilih lewat dialog. Lagu tanpa mp3 tidak boleh disimpan.
    if (audioTerpilih) {
      if (path.resolve(audioTerpilih) !== path.resolve(fileMp3)) {
        const sementaraMp3 = fileMp3 + '.tmp';
        fs.copyFileSync(audioTerpilih, sementaraMp3);
        fs.renameSync(sementaraMp3, fileMp3);
      }
    } else if (!fs.existsSync(fileMp3)) {
      return { ok: false, pesan: 'Belum memilih file mp3' };
    }
    const final = { ...data, id: id, audio: id + '.mp3' };
    tulisAman(fileJson, JSON.stringify(final, null, 2));
    audioTerpilih = null;
    return { ok: true, id: id };
  } catch (e) {
    return { ok: false, pesan: 'Gagal menyimpan: ' + e.message };
  }
});

// ---- Membuka lagu lama untuk diedit. Menerima id lagu.
// Pilihan mp3 sebelumnya dilupakan, supaya tidak ikut tersalin ke lagu yang salah.
ipcMain.handle('lagu:buka', (event, idMentah) => {
  try {
    audioTerpilih = null;
    const id = bersihkanNama(idMentah);
    const fileJson = path.join(FOLDER_LAGU, id + '.json');
    const fileMp3 = path.join(FOLDER_LAGU, id + '.mp3');
    if (!id || !fs.existsSync(fileJson)) return { ok: false, pesan: 'Lagu tidak ditemukan' };
    if (!fs.existsSync(fileMp3)) return { ok: false, pesan: 'File mp3 lagu ini tidak ada' };
    const data = JSON.parse(fs.readFileSync(fileJson, 'utf8'));
    return { ok: true, id: id, data: data, audioUrl: pathToFileURL(fileMp3).href };
  } catch (e) {
    return { ok: false, pesan: 'Gagal membuka: ' + e.message };
  }
});

// ---- Jendela
function bukaJendela() {
  const kalibrasi = MODE === 'kalibrasi';
  const halaman = path.join(__dirname, kalibrasi ? 'kalibrasi.html' : 'index.html');

  if (!fs.existsSync(halaman)) {
    dialog.showErrorBox('File tidak ditemukan', 'Tidak ada: ' + halaman);
    app.quit();
    return;
  }

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: kalibrasi ? 'Gamelan Kalibrasi' : 'Gamelan Simulator',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(halaman);
}

app.whenReady().then(bukaJendela);
app.on('window-all-closed', () => app.quit());