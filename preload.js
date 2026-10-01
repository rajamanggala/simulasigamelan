const { contextBridge, ipcRenderer } = require('electron');

// Fungsi ini tersedia di halaman sebagai window.gamelan
contextBridge.exposeInMainWorld('gamelan', {
  infoApp:    () => ipcRenderer.invoke('app:info'),      // {mode, folderLagu}
  daftarLagu: () => ipcRenderer.invoke('lagu:daftar'),   // daftar lagu dari folder backtrack/
  pilihAudio: () => ipcRenderer.invoke('audio:pilih'),   // dialog mp3 -> {ok, nama, saranNama, url}
  simpanLagu: (p) => ipcRenderer.invoke('lagu:simpan', p), // {nama, data, timpa} -> {ok, id} / {ok:false, pesan}
  bukaLagu:   (id) => ipcRenderer.invoke('lagu:buka', id),  // -> {ok, id, data, audioUrl}
  keluar:     () => ipcRenderer.invoke('app:keluar')        // tutup aplikasi
});