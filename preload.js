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
    ipcRenderer.send('download', {
      url: downloadZipURL
    });
  }
});

contextBridge.exposeInMainWorld('removeModule', {
  module: (modulePath) => {
    ipcRenderer.send('dirRemove', {
      module: modulePath
    });
  }
});

contextBridge.exposeInMainWorld('openConfig', {
  config: () => {
    ipcRenderer.send('configWindow', {
    });
  },
  back: () => {
    ipcRenderer.send('configWindowBack')
  }
});

contextBridge.exposeInMainWorld('getData', {
  data: () => {
    return ipcRenderer.sendSync('store-data', {
    });
  },
  launcherVersion: () => {
    return ipcRenderer.sendSync('sendLauncherVersion', {
    });
  }
});