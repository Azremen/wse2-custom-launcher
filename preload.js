const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('darkMode', {
  toggle: async () => { 
    return ipcRenderer.invoke('dark-mode:toggle').then((result) => {
      return result;
    }).catch((error) => {
      return error;
    });
  }
});

contextBridge.exposeInMainWorld('downloadZipURL', {
  url: (downloadZipURL) => {
    ipcRenderer.send("download", {
      url: downloadZipURL
    });
  }
});

contextBridge.exposeInMainWorld('getData', {
  data: () => {
    return ipcRenderer.sendSync("store-data", {
      info: 'data'
    });
  },
  moduleVersion: () => {
    return ipcRenderer.sendSync("store-data", {
      info: 'moduleVersion'
    });
  },
  img: () => {
    return ipcRenderer.sendSync("store-data", {
      info: 'img'
    });
  },
});