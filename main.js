const { app, BrowserWindow, ipcMain, nativeTheme, globalShortcut, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require('fs');
const AdmZip = require('adm-zip');
const ini = require('ini');
const crypto = require('crypto'); // Built-in Node.js crypto for hashing

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

// Catch crashes and async errors
process.on('uncaughtException', (error) => {
    console.error('CRITICAL: Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
    console.error('CRITICAL: Unhandled Rejection:', reason);
});

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

// Robust Modules Path Discovery
let possiblePaths = [];

// 1. Portable Executable Env (Electron Builder Nsis/Portable)
if (process.env.PORTABLE_EXECUTABLE_DIR) {
    possiblePaths.push(path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'Modules'));
}

// 2. Install Path (Standard)
possiblePaths.push(path.join(installPath, 'Modules'));

// 3. Current Working Directory
possiblePaths.push(path.join(process.cwd(), 'Modules'));

// 4. Parent Directory (Useful if launcher is in /bin/)
possiblePaths.push(path.join(installPath, '..', 'Modules'));

let modulesPath = null;

for (const p of possiblePaths) {
    try {
        if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
            modulesPath = p;
            console.log(`[Path Discovery] Found Modules at: ${modulesPath}`);
            break;
        }
    } catch(e) { console.error(`Error checking path ${p}:`, e); }
}

// Fallback: If nothing found, default to Install Path
if (!modulesPath) {
    modulesPath = path.join(installPath, 'Modules');
    console.log(`[Path Discovery] No existing Modules folder found. Defaulting to: ${modulesPath}`);
}

// Default temp zip location, may be overridden if read-only
let tempZipPath = path.join(modulesPath, "temp.zip"); 

// Azremen's Permission Check: 
// Priority: Use the Installation Directory "Modules" folder so we can see existing game modules.
// Fallback: Only use UserData if we cannot even READ/ACCESS the installation directory.
try {
    if (!fs.existsSync(modulesPath)) {
        // Try to create it if it doesn't exist
        fs.mkdirSync(modulesPath, { recursive: true });
    }

    // Check Write Permissions (for downloading updates)
    try {
        const testFile = path.join(modulesPath, '.test_write');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
    } catch (writeErr) {
        console.warn("Modules directory is read-only. Listing modules will work, but installing/updating may fail unless run as Admin.", writeErr);
        // Move temp zip to a writable location so download phase doesn't fail immediately
        tempZipPath = path.join(app.getPath('userData'), 'wse2_temp_update.zip');
    }

} catch (e) {
    console.warn("Could not access install directory Modules folder. Falling back to UserData.", e);
    // If we can't even ensure existence or basic access, switch to UserData
    // This usually happens if the launcher is in a completely restricted folder
    const fallbackPath = path.join(app.getPath('userData'), 'Modules');
    try {
        if (!fs.existsSync(fallbackPath)) {
            fs.mkdirSync(fallbackPath, { recursive: true });
        }
        modulesPath = fallbackPath;
        tempZipPath = path.join(modulesPath, "temp.zip");
    } catch (e2) {
        console.error("Critical: Failed to initialize any Modules directory", e2);
    }
}


let mainWindow = null;
let cfgWindow = null;
const pendingDownloads = new Map();

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

    // Fail-safe Update Logic
    // 1. Silent error handler to prevent dialog popups on network failure
    autoUpdater.on('error', (error) => {
         // Log for debugging, but do not alert the user
         console.log(`Auto-updater error: ${error.message}`);
    });

    // 2. Non-blocking check
    try {
        // Fire and forget - don't await this, let it run in background
        autoUpdater.checkForUpdatesAndNotify().catch(err => {
             console.log("AutoUpdate check failed (network/repo issue):", err.message);
        });
    } catch (err) {
        console.log("AutoUpdate sync error:", err.message);
    }
    
    autoUpdater.on('update-available', () => {
        if(mainWindow) mainWindow.webContents.send('update_available');
    });
    
    autoUpdater.on('update-downloaded', () => {
        if(mainWindow) mainWindow.webContents.send('update_downloaded');
    });

    // Download Handler - UPDATED for Concurrency & Redirects
    mainWindow.webContents.session.on('will-download', (event, item, webContents) => {
        // Check URL chain to support redirects (GitHub releases -> AWS S3 etc)
        const chain = item.getURLChain();
        let meta = null;
        let matchedUrl = null;

        for (const u of chain) {
            if (pendingDownloads.has(u)) {
                meta = pendingDownloads.get(u);
                matchedUrl = u;
                break;
            }
        }
        
        if (!meta) {
            // Not one of our managed downloads
            return;
        }

        // Unique temp path
        const uniqueTempName = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.zip`;
        const downloadPath = path.join(modulesPath, uniqueTempName);
        
        console.log(`[Download] Saving ${meta.name} to ${downloadPath}`);
        item.setSavePath(downloadPath);

        item.on('updated', (event, state) => {
            if (state === 'interrupted') {
                console.log(`[Download] Interrupted: ${meta.name}`);
            } else if (state === 'progressing') {
                if (!item.isPaused()) {
                    const perc = item.getReceivedBytes() / item.getTotalBytes() * 100;
                    mainWindow.webContents.send('download-progress', perc);
                }
            }
        });

        item.once('done', (event, state) => {
            // Clean up using the URL we matched
            if (matchedUrl) pendingDownloads.delete(matchedUrl);
            
            if (state === 'completed') {
                // Defer processing to helper function
                processDownloadedModule(downloadPath, meta);
            } else {
                console.log(`[Download] Failed: ${state}`);
                mainWindow.webContents.send('download-error', `Download failed: ${state}`);
                try { 
                    if (fs.existsSync(downloadPath)) fs.unlinkSync(downloadPath); 
                } catch(e) {}
            }
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

    // WSE2 is a 32-bit Windows app.
    // On Linux/Mac, we must use Wine (or similar compatibility layer) to launch it.
    const isWindows = process.platform === 'win32';
    
    const exeName = winExeName; 
    
    // Azremen Fix: Try to find Exe relative to the detected Modules folder first
    // Because if the launcher is running from Temp (Zip/Installer), installPath is wrong.
    // But modulesPath is correct (checked via CWD/Env).
    // Structure: GameDir/Modules -> GameDir/mb_warband_wse2.exe
    let potentialExePath = path.join(modulesPath, '..', exeName);
    
    if (!fs.existsSync(potentialExePath)) {
        // Fallback: Check standard install path (legacy behavior)
        potentialExePath = path.join(installPath, exeName);
    }
    
    // Fallback 2: Check CWD directly
    if (!fs.existsSync(potentialExePath)) {
        potentialExePath = path.join(process.cwd(), exeName);
    }
    
    const exePath = potentialExePath;
    const workingDir = path.dirname(exePath); // Run from the folder containing the Exe
    
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
        
        // Azremen: Pipe game output to main logger instead of separate files
        // This prevents permission errors in read-only directories and keeps logs unified.
        
        const gameProcess = spawn(command, finalArgs, {
            cwd: workingDir, // Important: Run from game directory (where EXE is)
            detached: true,
            env: env, 
            stdio: ['ignore', 'pipe', 'pipe'] // Pipe stdout/stderr back to parent
        });

        // Redirect game output to main log
        gameProcess.stdout.on('data', (data) => {
            const lines = data.toString().trim().split('\n');
            lines.forEach(line => console.log(`[GAME/OUT] ${line}`));
        });

        gameProcess.stderr.on('data', (data) => {
            const lines = data.toString().trim().split('\n');
            lines.forEach(line => console.error(`[GAME/ERR] ${line}`));
        });

        gameProcess.on('error', (err) => {
             console.error('Failed to start subprocess:', err);
             mainWindow.webContents.send('download-error', 'Failed to launch: ' + err.message);
        });

        // Azremen: Monitor for early exit (crash on startup)
        const checkTimer = setTimeout(() => {
            // Assume stable after 5 seconds, unref to allow independent running
            if (gameProcess && !gameProcess.killed) {
                gameProcess.unref();

                // If using 'pipe', we must unpipe or destroy streams if we want to detach fully
                // Otherwise the parent process keeps waiting for output
                // But since we want logs, we keep listening? 
                // Actually if we want to DETACH, we should stop listening eventually or let it run.
                // For now, let's keep listening until the game closes or until the user closes the launcher.
            }
        }, 5000);

        gameProcess.on('headers', (d) => {/*ignore*/}); // invalid event for child_process, removing just in case

        gameProcess.on('exit', (code, signal) => {
            clearTimeout(checkTimer);
            console.log(`[Launch] Process exited with code ${code} signal ${signal}`);
            
            if (code !== 0) {
                const msg = `Game exited immediately (Code: ${code}). Check wse2-launcher.log for details.`;
                console.error(msg);
                if (mainWindow && !mainWindow.isDestroyed()) {
                     mainWindow.webContents.send('download-error', msg); // Show alert to user
                }
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
    pendingDownloads.set(url, meta); // Store metadata for post-download processing
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
        // iMaxNumCorpses -> max_num_corpses
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

async function processDownloadedModule(tempZipPath, meta) {
    try {
        console.log(`[Install] Processing ${meta.name}...`);
        
        // INTEGRITY CHECK
        if (meta.md5) {
            console.log('[Install] Verifying integrity...');
            if (mainWindow) mainWindow.webContents.send('download-progress', 100);
            
            try {
                const hash = crypto.createHash('md5');
                const stream = fs.createReadStream(tempZipPath);
                
                await new Promise((resolve, reject) => {
                    stream.on('data', chunk => hash.update(chunk));
                    stream.on('end', resolve);
                    stream.on('error', reject);
                });
                
                const downloadHash = hash.digest('hex');
                console.log(`[Install] Hash Check: Server[${meta.md5}] vs Local[${downloadHash}]`);
                
                if (downloadHash !== meta.md5) {
                    throw new Error("Integrity Check Failed! File corrupted.");
                }
            } catch (hashErr) {
                console.error("[Install] Integrity check error:", hashErr);
                throw hashErr; 
            }
        }

        // CLEAN INSTALL LOGIC
        if (meta.cleanInstall) {
            const targetDir = path.join(modulesPath, meta.name);
            console.log(`[Clean Install] Removing: ${targetDir}`);
            try {
                if (fs.existsSync(targetDir)) {
                    fs.rmSync(targetDir, { recursive: true, force: true });
                }
            } catch (cleanErr) {
                console.error("[Install] Clean install removal failed:", cleanErr);
            }
        }

        console.log('[Install] Extracting...');
        const zip = new AdmZip(tempZipPath);
        
        // Smart Extraction Logic
        const entries = zip.getEntries();
        let hasRootFolder = false;
        let rootFolderName = "";
        
        if (entries.length > 0) {
            const firstEntry = entries[0];
            const firstPath = firstEntry.entryName;
            const parts = firstPath.split('/');
            
            if (parts.length > 1 && parts[0]) {
                const potentialRoot = parts[0] + '/';
                const allMatch = entries.every(e => e.entryName.startsWith(potentialRoot) || (e.isDirectory && e.entryName === potentialRoot));
                if (allMatch) {
                    hasRootFolder = true;
                    rootFolderName = parts[0];
                }
            }
        }

        const targetModuleDir = path.join(modulesPath, meta.name);

        if (hasRootFolder) {
            if (rootFolderName === meta.name) {
                zip.extractAllTo(modulesPath, true);
            } else {
                // Rename scenario
                const tempExtractDir = path.join(modulesPath, `_temp_${Date.now()}_extract`);
                zip.extractAllTo(tempExtractDir, true);
                
                const extractedRoot = path.join(tempExtractDir, rootFolderName);
                
                if (!fs.existsSync(targetModuleDir)) {
                     fs.renameSync(extractedRoot, targetModuleDir);
                } else {
                     // Merge
                     if(fs.existsSync(extractedRoot)) {
                         const files = fs.readdirSync(extractedRoot);
                         files.forEach(file => {
                             const src = path.join(extractedRoot, file);
                             const dest = path.join(targetModuleDir, file);
                             fs.cpSync(src, dest, { recursive: true, force: true }); 
                         });
                     }
                }
                fs.rmSync(tempExtractDir, { recursive: true, force: true });
            }
        } else {
            console.log(`[Install] Extracting flat zip to ${targetModuleDir}`);
             if (!fs.existsSync(targetModuleDir)) {
                fs.mkdirSync(targetModuleDir, { recursive: true });
            }
            zip.extractAllTo(targetModuleDir, true);
        }
        
        // Write version.json
        if (meta.name && meta.version) {
            try {
                const modDir = path.join(modulesPath, meta.name);
                if (fs.existsSync(modDir)) {
                    const vFile = path.join(modDir, 'version.json');
                    fs.writeFileSync(vFile, JSON.stringify({ version: meta.version }, null, 4));
                }
            } catch(e) { console.error("Failed to write version.json", e); }
        }
        
        if (mainWindow) mainWindow.webContents.send('download-complete');
        
    } catch (err) {
        console.error("Installation failed:", err);
        if (mainWindow) mainWindow.webContents.send('download-error', err.message);
    } finally {
        setTimeout(() => {
            try { 
                if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath); 
            } catch(e) {}
        }, 1000); 
    }
}
