const { app, BrowserWindow, ipcMain, nativeTheme, globalShortcut, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require('fs');
const AdmZip = require('adm-zip');
const ini = require('ini');

// Azremen: Simple File Logger implementation to catch startup errors
// Try standard location first, fallback to temp on Linux for visibility
let logPath;
try {
    const logName = 'wse2-launcher.log';
    if (process.platform === 'linux') {
        // Force /tmp for easy finding on Linux
        logPath = path.join('/tmp', logName);
    } else {
        logPath = path.join(app.getPath('userData'), logName);
    }
    // Clear previous log
    fs.writeFileSync(logPath, '');
} catch(e) {
    console.error("Failed to initialize log path", e);
}

function logToFile(level, args) {
    if (!logPath) return;
    const msg = args.map(a => (typeof a === 'object' && a !== null ? JSON.stringify(a) : String(a))).join(' ');
    const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
    try { fs.appendFileSync(logPath, line); } catch(e) {}
}

// Hook console methods
const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
    logToFile('INFO', args);
    originalLog.apply(console, args);
};

console.error = (...args) => {
    logToFile('ERROR', args);
    originalError.apply(console, args);
};

console.log(`Launcher starting... Log file path: ${logPath}`);

// Determine paths
const isDev = !app.isPackaged;

function getBaseDirectory() {
    // AppImage Support: Use the directory where the .AppImage file is located
    if (process.env.APPIMAGE) {
        return path.dirname(process.env.APPIMAGE);
    }

    let basePath = isDev ? __dirname : path.dirname(app.getPath('exe'));
    
    // Fix for macOS .app bundles
    // If we are inside an .app bundle, we usually want to step out to the folder containing the .app
    // so that "Modules" are stored next to the launcher app, not hidden deep inside it.
    if (process.platform === 'darwin' && !isDev) {
        if (basePath.includes('.app/Contents/')) {
            // Traverse up 3 levels: MacOS -> Contents -> App.app -> User folder
            basePath = path.resolve(basePath, '../../..');
        }
    }
    return basePath;
}

const installPath = getBaseDirectory();

// Azremen: Optimize for compatibility
// NOTE: "disable-gpu" and "disable-software-rasterizer" can cause BLANK SCREENS on native Linux.
// Only use "no-sandbox" if absolutely necessary, but usually AppImage handles itself.
// app.commandLine.appendSwitch('no-sandbox'); 
// app.commandLine.appendSwitch('disable-gpu');
// app.commandLine.appendSwitch('disable-software-rasterizer');

// Azremen's Modules path logic with fallback system
let modulesPath = path.join(installPath, 'Modules');
let tempZipPath = path.join(modulesPath, "temp.zip");

// Azremen's Permission Check: Try to create/access the preferred path. If it fails (permissions), fallback to UserData.
try {
    if (!fs.existsSync(modulesPath)) {
        fs.mkdirSync(modulesPath, { recursive: true });
    }
    // Azremen: Test write permission to ensure we can save config
    const testFile = path.join(modulesPath, '.test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
} catch (e) {
    console.warn("Write access denied to install dir, falling back to UserData.", e);
    modulesPath = path.join(app.getPath('userData'), 'Modules');
    tempZipPath = path.join(modulesPath, "temp.zip");
    if (!fs.existsSync(modulesPath)) {
        fs.mkdirSync(modulesPath, { recursive: true });
    }
}


let mainWindow = null;
let cfgWindow = null;
let pendingModuleMeta = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        sandbox: true,
        width: 1280,
        height: 720,
        backgroundColor: '#2c2f33',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadFile('main.html');
    
    // Azremen: Debug Renderer Loading
    mainWindow.webContents.on('did-finish-load', () => {
        console.log("Renderer loaded main.html successfully.");
    });
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error("Failed to load main.html:", errorCode, errorDescription);
    });
    
    // DevTools Shortcut (F12) - Only in Dev
    if (isDev) {
        mainWindow.webContents.on('before-input-event', (event, input) => {
            if (input.key === 'F12' && input.type === 'keyDown') {
                mainWindow.webContents.toggleDevTools();
            }
        });
    }

    // Auto Update events
    // DISABLED mainly for now to prevent startup 404 errors on empty/private repos
    /* 
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
        console.log("AutoUpdate check failed (expected if private repo or no releases):", err.message);
    });
    */
    
    autoUpdater.on('update-available', () => {
        if(mainWindow) mainWindow.webContents.send('update_available');
    });
    
    autoUpdater.on('update-downloaded', () => {
        if(mainWindow) mainWindow.webContents.send('update_downloaded');
    });

    // Download Handler
    mainWindow.webContents.session.on('will-download', (event, item, webContents) => {
        item.setSavePath(tempZipPath);

        item.on('updated', (event, state) => {
            if (state === 'interrupted') {
                console.log('Download is interrupted but can be resumed');
            } else if (state === 'progressing') {
                if (!item.isPaused()) {
                    const perc = item.getReceivedBytes() / item.getTotalBytes() * 100;
                    mainWindow.webContents.send('download-progress', perc);
                }
            }
        });

        item.once('done', (event, state) => {
            if (state === 'completed') {
                try {
                    console.log('Download completed, extracting...');
                    const zip = new AdmZip(tempZipPath);
                    zip.extractAllTo(modulesPath, true);
                    
                    // Write version.json if metadata exists
                    if (pendingModuleMeta && pendingModuleMeta.name && pendingModuleMeta.version) {
                        try {
                            const modDir = path.join(modulesPath, pendingModuleMeta.name);
                            if (fs.existsSync(modDir)) {
                                const vFile = path.join(modDir, 'version.json');
                                fs.writeFileSync(vFile, JSON.stringify({ version: pendingModuleMeta.version }, null, 4));
                            }
                        } catch(e) { console.error("Failed to write version.json", e); }
                    }
                    pendingModuleMeta = null;

                    // Refresh UI
                    mainWindow.webContents.send('download-complete');
                } catch (err) {
                    console.error("Extraction failed:", err);
                    mainWindow.webContents.send('download-error', err.message);
                }
            } else {
                console.log(`Download failed: ${state}`);
                mainWindow.webContents.send('download-error', state);
            }
            
            // Allow file release before unlink
            setTimeout(() => {
                try { 
                    if (fs.existsSync(tempZipPath)) {
                        fs.unlinkSync(tempZipPath); 
                        console.log("Cleanup successful");
                    }
                } catch(e) {
                    console.error("Cleanup failed:", e);
                }
            }, 1000); // 1 second buffer
        });
    });
}

app.whenReady().then(() => {
    createWindow();

    // Enable DevTools shortcut globally for now to help debug the blank screen issue
    globalShortcut.register('CommandOrControl+Shift+I', () => {
         if (mainWindow) mainWindow.webContents.toggleDevTools();
    });

    if (isDev) {
        globalShortcut.register('CommandOrControl+R', () => {
            if (mainWindow) mainWindow.reload();
            if (cfgWindow) cfgWindow.reload();
        });

        globalShortcut.register('CommandOrControl+D', () => {
            if (mainWindow) mainWindow.webContents.openDevTools();
        });
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

/* Azremen's IPC Handlers Configuration */

// Azremen: Dark Mode Toggle Logic
ipcMain.handle('dark-mode:toggle', () => {
    if (nativeTheme.shouldUseDarkColors) {
        nativeTheme.themeSource = 'light';
        return false;
    } else {
        nativeTheme.themeSource = 'dark';
        return true;
    }
});

// Azremen: Fetch Launcher Version
ipcMain.handle('get-version', () => {
    return app.getVersion();
});

// Azremen: Open Installation Folder in Explorer/Finder
ipcMain.handle('open-install-folder', () => {
    shell.openPath(installPath);
});

// Azremen: Launch Game Process (External)
ipcMain.handle('launch-game', (event, moduleName) => {
    if (!moduleName) return false;

    // Azremen: Construct command - mb_warband_wse2.exe --module <ModuleName> --no-intro
    
    // Check if executable exists
    const winExeName = 'mb_warband_wse2.exe';

    // The user specified WSE2 is a 32-bit Windows app.
    // On Linux/Mac, we must use Wine (or similar compatibility layer) to launch it.
    const isWindows = process.platform === 'win32';
    
    const exeName = winExeName; 
    const exePath = path.join(installPath, exeName);
    
    console.log(`[Launch] Request to launch: ${exeName} with module ${moduleName} (Platform: ${process.platform})`);
    
    const { spawn } = require('child_process');
    
    // Using detached to let the game run independently of the launcher
    // Arguments: --module YourModule --no-intro
    
    const gameArgs = ['--module', moduleName, '--no-intro'];

    let command;
    let finalArgs;

    if (isWindows) {
        command = exeName;
        finalArgs = gameArgs;
    } else {
        // On Linux/Mac, try to launch with Wine
        command = 'wine';
        finalArgs = [path.basename(exePath), ...gameArgs];
    }

    if (!fs.existsSync(exePath)) {
        const msg = `Executable not found at: ${exePath}`;
        console.error(msg);
        mainWindow.webContents.send('download-error', msg); // Reusing download-error to show alert if possible
        return false;
    }
    
    try {
        console.log(`[Launch] Spawning: ${command} ${finalArgs.join(' ')}`);
        console.log(`[Launch] CWD: ${installPath}`);
        
        const env = { ...process.env };
        
        // Azremen: Linux/Wine Compatibility Fixes
        if (process.platform !== 'win32') {
             // 1. Warband 32-bit Memory Fix
             env.WINE_LARGE_ADDRESS_AWARE = '1';
             
             // 2. Disable Media Foundation/GStreamer (Prevents intro video crashes)
             // Even with --no-intro, the libraries load and can crash older games
             env.WINEDLLOVERRIDES = "winegstreamer=d"; 
             
             // 3. Force distinct locale to prevent parsing errors
             env.LC_ALL = "C";
        }
        
        // Log output to a file for debugging "Black Screen" issues
        const outLog = fs.openSync(path.join(installPath, 'wse2_launch_out.log'), 'w');
        const errLog = fs.openSync(path.join(installPath, 'wse2_launch_err.log'), 'w');

        const gameProcess = spawn(command, finalArgs, {
            cwd: installPath, // Important: Run from game directory
            detached: true,
            env: env, 
            stdio: ['ignore', outLog, errLog]
        });

        gameProcess.on('error', (err) => {
             console.error('Failed to start subprocess:', err);
             mainWindow.webContents.send('download-error', 'Failed to launch: ' + err.message);
        });

        // Azremen: Monitor for early exit (crash on startup)
        const checkTimer = setTimeout(() => {
            // Assume stable after 5 seconds, unref to allow independent running
            if (!gameProcess.killed) {
                gameProcess.unref();
            }
        }, 5000);

        gameProcess.on('exit', (code, signal) => {
            clearTimeout(checkTimer);
            console.log(`[Launch] Process exited with code ${code} signal ${signal}`);
            
            if (code !== 0) {
                // Read error log to give a hint
                let errDetails = "";
                try {
                    const errLogPath = path.join(installPath, 'wse2_launch_err.log');
                    if (fs.existsSync(errLogPath)) {
                        const logs = fs.readFileSync(errLogPath, 'utf-8');
                        // Take last 3 lines
                        errDetails = logs.split('\n').slice(-3).join('\n');
                    }
                } catch(e) {}
                
                const msg = `Game exited immediately (Code: ${code}).\n\nDetails:\n${errDetails}`;
                console.error(msg);
                mainWindow.webContents.send('download-error', msg); // Show alert to user
            }
        });

        return true;
    } catch (e) {
        console.error("Failed to launch game:", e);
        return false;
    }
});

// Global state for config
let currentConfigModulePath = null;

// App Config Window
ipcMain.on('configWindow', (event, modulePath) => {
    if (cfgWindow) {
        cfgWindow.focus();
        return;
    }
    
    currentConfigModulePath = modulePath;

    cfgWindow = new BrowserWindow({
        width: 800,
        height: 600,
        parent: mainWindow,
        modal: true,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    
    cfgWindow.setMenuBarVisibility(false);
    cfgWindow.loadFile('config.html');
    
    // DevTools Shortcut (F12)
    cfgWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' && input.type === 'keyDown') {
             cfgWindow.webContents.toggleDevTools();
        }
    });
    
    cfgWindow.once('ready-to-show', () => {
        cfgWindow.show();
    });

    cfgWindow.on('closed', () => {
        cfgWindow = null;
    });
});

ipcMain.on('configWindowBack', () => {
    if (cfgWindow) cfgWindow.close();
});

// Download Trigger
ipcMain.on("download", (event, url, meta) => {
    pendingModuleMeta = meta; // Store metadata for post-download processing
    if (mainWindow) {
        mainWindow.webContents.downloadURL(url);
    }
});

// Scan Modules
ipcMain.handle('get-modules', () => {
    if (!fs.existsSync(modulesPath)) return [];

    try {
        const files = fs.readdirSync(modulesPath);
        const ret = [];

        for (const file of files) {
            const fullPath = path.join(modulesPath, file);
            if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
                const modData = { 
                    name: file, 
                    version: null, 
                    path: fullPath, 
                    hasImage: false,
                    configExists: false
                };

                // Check version.json
                const versionFile = path.join(fullPath, 'version.json');
                if (fs.existsSync(versionFile)) {
                    try {
                        const rawdata = fs.readFileSync(versionFile);
                        modData.version = JSON.parse(rawdata).version;
                    } catch (e) {
                         console.error("Error reading version.json for " + file, e);
                    }
                }

                // Check main.bmp
                const imgPath = path.join(fullPath, 'main.bmp');
                modData.hasImage = fs.existsSync(imgPath);
                if(modData.hasImage) {
                    modData.imagePath = imgPath; 
                }

                // Check for config template
                const configPath = path.join(fullPath, 'module_config_template.ini');
                modData.configExists = fs.existsSync(configPath);

                ret.push(modData);
            }
        }
        return ret;
    } catch (error) {
        console.error("Error scanning modules:", error);
        return [];
    }
});

// Remove Module
ipcMain.handle('remove-module', (event, modPath) => {
    try {
        if (modPath && fs.existsSync(modPath)) {
            // Security check: ensure modPath is inside modulesPath
            const resolvedPath = path.resolve(modPath);
            const resolvedModules = path.resolve(modulesPath);
            if (resolvedPath.startsWith(resolvedModules)) {
                fs.rmSync(resolvedPath, { recursive: true, force: true });
                return true;
            }
        }
        return false;
    } catch (e) {
        console.error(e);
        return false;
    }
});

// Config Reading/Writing
ipcMain.handle('get-config-data', (event, selectedModulePath) => {
    try {
        const targetPath = selectedModulePath || currentConfigModulePath;

        // 1. Read Schema from config.json in app structure
        const schemaPath = path.join(__dirname, 'config.json');
        console.log(`[Config] Reading schema from: ${schemaPath}`);
        
        let schema = {};
        if (fs.existsSync(schemaPath)) {
            try {
                schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
                console.log(`[Config] Schema loaded. Sections: ${Object.keys(schema).length}`);
            } catch(e) {
                 console.error("[Config] JSON Parse Error for config.json:", e);
            }
        } else {
            console.error("[Config] config.json NOT FOUND at " + schemaPath);
        }

        // 2. Read Values from the Module's INI file
        let values = {};
        if (targetPath) {
             const iniPath = path.join(targetPath, 'module_config_template.ini');
             console.log(`[Config] Checking/Creating INI at: ${iniPath}`);
             
             if (fs.existsSync(iniPath)) {
                 console.log("[Config] File exists, reading...");
                 values = ini.parse(fs.readFileSync(iniPath, 'utf-8'));
             } else {
                 console.log("[Config] File missing. Generating defaults...");
                 // Create from defaults if missing
                 for (const section in schema) {
                     values[section] = {};
                     for (const key in schema[section]) {
                         values[section][key] = schema[section][key]['default-value'];
                     }
                 }
                 try {
                     const iniContent = ini.stringify(values);
                     fs.writeFileSync(iniPath, iniContent, 'utf-8');
                     console.log("[Config] Success. default module_config_template.ini created.");
                 } catch(err) {
                     console.error("[Config] FAILED to create default config file:", err);
                 }
             }
        } else {
            console.error("[Config] No Target Path provided to get-config-data!");
        }

        return { schema, values, modulePath: targetPath };
    } catch (e) {
        console.error("Error reading config:", e);
        return { schema: {}, values: {}, error: e.message };
    }
});

ipcMain.handle('save-config-data', (event, { modulePath, configData }) => {
    try {
        console.log(`[Save Config] Request received for: ${modulePath}`);
        
        if (!modulePath) {
            console.error("[Save Config] No module path provided");
            return false;
        }
        
        // Ensure security check
        const resolvedPath = path.resolve(modulePath);
        const resolvedModules = path.resolve(modulesPath);
        
        // Allow if inside modules path OR if we are in dev/test mode and just want to write
        // But strictly:
        if (!resolvedPath.startsWith(resolvedModules)) {
             console.error(`[Save Config] Security check failed. Path ${resolvedPath} is not inside ${resolvedModules}`);
             throw new Error("Invalid module path");
        }

        const iniPath = path.join(modulePath, 'module_config_template.ini');
        console.log(`[Save Config] Writing to: ${iniPath}`);
        
        // Convert to INI
        // The user mentioned underscores. If they strictly want snake_case keys (e.g. iMaxNumCorpses -> max_num_corpses),
        // we would need a converter here. For now, we stick to the schema names from CSV.
        const iniString = ini.stringify(configData);
        
        fs.writeFileSync(iniPath, iniString, 'utf-8');
        
        if (fs.existsSync(iniPath)) {
            console.log("[Save Config] File written successfully.");
            return true;
        } else {
            console.error("[Save Config] File write appeared to succeed but file is missing!");
            return false;
        }
    } catch (e) {
        console.error("Error saving config:", e);
        return false;
    }
});

ipcMain.on('restart_app', () => {
    autoUpdater.quitAndInstall();
});
