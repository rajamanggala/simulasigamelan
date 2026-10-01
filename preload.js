const { contextBridge, ipcRenderer } = require('electron');

// Dua fungsi ini tersedia di halaman sebagai window.gamelan
contextBridge.exposeInMainWorld('gamelan', {
  infoApp:    () => ipcRenderer.invoke('app:info'),   // {mode, folderLagu}
  daftarLagu: () => ipcRenderer.invoke('lagu:daftar') // daftar lagu dari folder backtrack/
});