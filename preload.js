const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    darkMode: {
        toggle: () => ipcRenderer.invoke('dark-mode:toggle')
    },
    launcher: {
        getVersion: () => ipcRenderer.invoke('get-version'),
        restart: () => ipcRenderer.send('restart_app'),
        openFolder: () => ipcRenderer.invoke('open-install-folder'),
        launch: (moduleName) => ipcRenderer.invoke('launch-game', moduleName)
    },
    modules: {
        list: () => ipcRenderer.invoke('get-modules'),
        remove: (path) => ipcRenderer.invoke('remove-module', path),
        download: (url, meta) => ipcRenderer.send('download', url, meta)
    },
    config: {
        open: (path) => ipcRenderer.send('configWindow', path),
        close: () => ipcRenderer.send('configWindowBack'),
        get: (modulePath) => ipcRenderer.invoke('get-config-data', modulePath),
        save: (modulePath, data) => ipcRenderer.invoke('save-config-data', { modulePath, configData: data })
    },
    events: {
        onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (event, value) => callback(value)),
        onDownloadComplete: (callback) => ipcRenderer.on('download-complete', (event) => callback()),
        onDownloadError: (callback) => ipcRenderer.on('download-error', (event, error) => callback(error)),
        onUpdateAvailable: (callback) => ipcRenderer.on('update_available', () => callback()),
        onUpdateDownloaded: (callback) => ipcRenderer.on('update_downloaded', () => callback())
    }
});
