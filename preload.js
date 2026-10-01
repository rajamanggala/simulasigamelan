const { contextBridge, ipcRenderer } = require('electron');

// Fungsi ini tersedia di halaman sebagai window.gamelan
contextBridge.exposeInMainWorld('gamelan', {
  infoApp:    () => ipcRenderer.invoke('app:info'),    // {mode, folderLagu}
  daftarLagu: () => ipcRenderer.invoke('lagu:daftar'), // daftar lagu dari folder backtrack/
  simpanLagu: (p) => ipcRenderer.invoke('lagu:simpan', p) // {nama, data, timpa} -> {ok, id} atau {ok:false, pesan}
});