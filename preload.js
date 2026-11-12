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
        launch: (moduleName, modulePath, useX64) => ipcRenderer.invoke('launch-game', moduleName, modulePath, useX64),
        connect: (moduleName, modulePath, useX64, connection) => ipcRenderer.invoke('connect-game', moduleName, modulePath, useX64, connection),
        hasX64: () => ipcRenderer.invoke('has-x64-executable'),
        getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
        setAutoLaunch: (val) => ipcRenderer.invoke('set-auto-launch', val),
    },
    multiplayer: {
        getSettings: () => ipcRenderer.invoke('get-multiplayer-settings'),
        saveSettings: (settings) => ipcRenderer.invoke('save-multiplayer-settings', settings),
        browse: (kind) => ipcRenderer.invoke('browse-server-file', kind),
        launchDedicated: (moduleName, settings) => ipcRenderer.invoke('launch-dedicated', moduleName, settings),
        editConfig: (filePath, exePath) => ipcRenderer.invoke('open-server-config', filePath, exePath),
        importArguments: () => ipcRenderer.invoke('import-server-arguments'),
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
        save: (modulePath, data, saveAs = false) => ipcRenderer.invoke('save-config-data', { modulePath, configData: data, saveAs })
    },
    wine: {
        getSettings: () => ipcRenderer.invoke('get-wine-settings'),
        setSettings: (settings) => ipcRenderer.invoke('set-wine-settings', settings),
        browse: () => ipcRenderer.invoke('browse-wine-executable'),
        isWindows: () => process.platform === 'win32',
        checkDxvk: () => ipcRenderer.invoke('check-dxvk'),
        installDxvk: () => ipcRenderer.invoke('install-dxvk'),
        getGameLanguages: () => ipcRenderer.invoke('get-game-languages'),
    },
    events: {
        // Each on* returns an unsubscribe function instead of nuking all app-wide listeners for the channel.
        onDownloadProgress: (callback) => {
            const handler = (_, value) => callback(value);
            ipcRenderer.on('download-progress', handler);
            return () => ipcRenderer.removeListener('download-progress', handler);
        },
        onDownloadComplete: (callback) => {
            const handler = () => callback();
            ipcRenderer.on('download-complete', handler);
            return () => ipcRenderer.removeListener('download-complete', handler);
        },
        onDownloadError: (callback) => {
            const handler = (_, error) => callback(error);
            ipcRenderer.on('download-error', handler);
            return () => ipcRenderer.removeListener('download-error', handler);
        },
        onUpdateAvailable: (callback) => {
            const handler = () => callback();
            ipcRenderer.on('update_available', handler);
            return () => ipcRenderer.removeListener('update_available', handler);
        },
        onUpdateDownloaded: (callback) => {
            const handler = () => callback();
            ipcRenderer.on('update_downloaded', handler);
            return () => ipcRenderer.removeListener('update_downloaded', handler);
        },
        onUpdateProgress: (callback) => {
            const handler = (_, pct) => callback(pct);
            ipcRenderer.on('update_download_progress', handler);
            return () => ipcRenderer.removeListener('update_download_progress', handler);
        },
        onAppLog: (callback) => {
            const handler = (_, entry) => callback(entry);
            ipcRenderer.on('app-log', handler);
            return () => ipcRenderer.removeListener('app-log', handler);
        },
        onAppError: (callback) => {
            const handler = (_, msg) => callback(msg);
            ipcRenderer.on('app-error', handler);
            return () => ipcRenderer.removeListener('app-error', handler);
        }
    }
});
