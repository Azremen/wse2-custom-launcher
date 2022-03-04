const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('darkMode', {
  toggle: () => ipcRenderer.invoke('dark-mode:toggle'),
  system: () => ipcRenderer.invoke('dark-mode:system')
});

contextBridge.exposeInMainWorld('downloadZipURL', {
  url: (downloadZipURL) => {
    ipcRenderer.send("download", {
      url: downloadZipURL
    })
  }
});

contextBridge.exposeInMainWorld('getData', {
  data: () => {
    return ipcRenderer.sendSync("store-data");
  }
});