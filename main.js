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