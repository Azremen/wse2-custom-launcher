'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    darkMode: {
        toggle: () => ipcRenderer.invoke('dark-mode:toggle')
    },
    launcher: {
        getVersion: () => ipcRenderer.invoke('get-version'),
        restart: () => ipcRenderer.invoke('restart_app'),
        update: () => ipcRenderer.invoke('start_update'),
        checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
        cancelDownload: () => ipcRenderer.invoke('cancel-download'),
        openFolder: () => ipcRenderer.invoke('open-install-folder'),
        launch: (moduleName) => ipcRenderer.invoke('launch-game', moduleName),
        getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
        setAutoLaunch: (val) => ipcRenderer.invoke('set-auto-launch', val),
    },
    modules: {
        list: () => ipcRenderer.invoke('get-modules'),
        remove: (path) => ipcRenderer.invoke('remove-module', path),
        download: (url, meta) => ipcRenderer.invoke('download', url, meta)
    },
    config: {
        open: (path) => ipcRenderer.invoke('configWindow', path),
        close: () => ipcRenderer.invoke('configWindowBack'),
        get: (modulePath) => ipcRenderer.invoke('get-config-data', modulePath),
        save: (modulePath, data) => ipcRenderer.invoke('save-config-data', { modulePath, configData: data })
    },
    wine: {
        getSettings: () => ipcRenderer.invoke('get-wine-settings'),
        setSettings: (settings) => ipcRenderer.invoke('set-wine-settings', settings),
        browse: () => ipcRenderer.invoke('browse-wine-executable'),
        isWindows: () => process.platform === 'win32',
    },
    events: {
        onDownloadProgress: (callback) => { ipcRenderer.removeAllListeners('download-progress'); ipcRenderer.on('download-progress', (_, value) => callback(value)); },
        onDownloadComplete: (callback) => { ipcRenderer.removeAllListeners('download-complete'); ipcRenderer.on('download-complete', () => callback()); },
        onDownloadError: (callback) => { ipcRenderer.removeAllListeners('download-error'); ipcRenderer.on('download-error', (_, error) => callback(error)); },
        onUpdateAvailable: (callback) => { ipcRenderer.removeAllListeners('update_available'); ipcRenderer.on('update_available', () => callback()); },
        onUpdateDownloaded: (callback) => { ipcRenderer.removeAllListeners('update_downloaded'); ipcRenderer.on('update_downloaded', () => callback()); },
        onUpdateProgress: (callback) => { ipcRenderer.removeAllListeners('update_download_progress'); ipcRenderer.on('update_download_progress', (_, pct) => callback(pct)); },
        onAppLog: (callback) => { ipcRenderer.removeAllListeners('app-log'); ipcRenderer.on('app-log', (_, entry) => callback(entry)); },
        onAppError: (callback) => { ipcRenderer.removeAllListeners('app-error'); ipcRenderer.on('app-error', (_, msg) => callback(msg)); }
    }
});
