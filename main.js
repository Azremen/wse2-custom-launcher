'use strict';

const { app, BrowserWindow, ipcMain, nativeTheme, globalShortcut, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const ini = require('ini');
const crypto = require('crypto');
const { spawn } = require('child_process');

// ─── Constants ───────────────────────────────────────────────────────────────

const GAME_EXE_NAME = 'mb_warband_wse2.exe';
const LOG_FILE_NAME = 'wse2-launcher.log';
const LAUNCH_STABLE_DELAY = 5000; // ms before assuming the game launched successfully
const WRITE_TEST_FILE_NAME = '.test_write';
const VERSION_FILE = 'version.json';
const MODULE_IMAGE_FILE = 'main.bmp';
const MODULE_CONFIG_FILE = 'module_config_template.ini';
const APP_CONFIG_FILE = 'config.json';

const IS_DEV = !app.isPackaged;
const IS_WINDOWS = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';
const IS_MAC = process.platform === 'darwin';

// ─── Logger ──────────────────────────────────────────────────────────────────

let logPath = null;

(function initLogger() {
    try {
        let logDir;
        if (process.env.APPIMAGE) {
            logDir = path.dirname(process.env.APPIMAGE);
        } else if (IS_DEV) {
            logDir = __dirname;
        } else {
            logDir = path.dirname(app.getPath('exe'));
        }

        const candidatePath = path.join(logDir, LOG_FILE_NAME);

        try {
            fs.writeFileSync(candidatePath, '');
            logPath = candidatePath;
        } catch {
            logPath = IS_LINUX
                ? path.join('/tmp', LOG_FILE_NAME)
                : path.join(app.getPath('userData'), LOG_FILE_NAME);
            try { fs.writeFileSync(logPath, ''); } catch { /* no-op */ }
        }
    } catch (err) {
        console.error('Failed to initialize log path:', err);
    }
})();

function writeLog(level, args) {
    if (!logPath) return;
    const message = args
        .map(a => (a !== null && typeof a === 'object' ? JSON.stringify(a) : String(a)))
        .join(' ');
    const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
    try { fs.appendFileSync(logPath, line); } catch { /* no-op */ }
}

const _origLog = console.log.bind(console);
const _origError = console.error.bind(console);
const _origWarn = console.warn.bind(console);

console.log = (...args) => { writeLog('INFO', args); _origLog(...args); };
console.error = (...args) => { writeLog('ERROR', args); _origError(...args); };
console.warn = (...args) => { writeLog('WARN', args); _origWarn(...args); };

process.on('uncaughtException', err => console.error('CRITICAL - Uncaught Exception:', err));
process.on('unhandledRejection', reason => console.error('CRITICAL - Unhandled Rejection:', reason));

console.log(`Launcher starting... Log: ${logPath}`);

// ─── Path Resolution ─────────────────────────────────────────────────────────

function getBaseDirectory() {
    if (process.env.APPIMAGE) return path.dirname(process.env.APPIMAGE);

    let base = IS_DEV ? __dirname : path.dirname(app.getPath('exe'));

    if (IS_MAC && !IS_DEV && base.includes('.app/Contents/')) {
        base = path.resolve(base, '../../..');
    }

    return base;
}

const installPath = getBaseDirectory();

function resolveModulesPath() {
    const candidates = [
        process.env.PORTABLE_EXECUTABLE_DIR && path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'Modules'),
        path.join(installPath, 'Modules'),
        path.join(process.cwd(), 'Modules'),
        path.join(installPath, '..', 'Modules'),
    ].filter(Boolean);

    for (const candidate of candidates) {
        try {
            if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
                console.log(`[Paths] Modules found at: ${candidate}`);
                return candidate;
            }
        } catch (err) {
            console.error(`[Paths] Error checking ${candidate}:`, err);
        }
    }

    const fallback = path.join(installPath, 'Modules');
    console.log(`[Paths] No existing Modules directory found. Using default: ${fallback}`);
    return fallback;
}

let modulesPath = resolveModulesPath();
let tempZipPath = path.join(modulesPath, 'temp.zip');

(function ensureModulesDirectory() {
    try {
        if (!fs.existsSync(modulesPath)) {
            fs.mkdirSync(modulesPath, { recursive: true });
        }

        const testFile = path.join(modulesPath, WRITE_TEST_FILE_NAME);
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
    } catch (writeErr) {
        console.warn('[Paths] Modules directory is not writable. Updates may require elevated privileges.', writeErr);
        tempZipPath = path.join(app.getPath('userData'), 'wse2_temp_update.zip');
    }
})();

// ─── Window Management ───────────────────────────────────────────────────────

/** @type {BrowserWindow | null} */
let mainWindow = null;

/** @type {BrowserWindow | null} */
let cfgWindow = null;

/** @type {string | null} */
let currentConfigModulePath = null;

/** @type {Map<string, object>} */
const pendingDownloads = new Map();

const SHARED_WEB_PREFERENCES = {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
};

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        backgroundColor: '#2c2f33',
        webPreferences: SHARED_WEB_PREFERENCES,
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadFile('main.html');

    mainWindow.webContents.on('did-finish-load', () =>
        console.log('[Window] main.html loaded.')
    );
    mainWindow.webContents.on('did-fail-load', (_, code, desc) =>
        console.error(`[Window] Failed to load main.html: ${code} - ${desc}`)
    );

    if (IS_DEV) {
        mainWindow.webContents.on('before-input-event', (_, input) => {
            if (input.type === 'keyDown' && input.key === 'F12') {
                mainWindow.webContents.toggleDevTools();
            }
        });
    }

    setupAutoUpdater();
    setupDownloadHandler();
}

function createConfigWindow(modulePath) {
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
        backgroundColor: '#2c2f33',
        webPreferences: { ...SHARED_WEB_PREFERENCES, sandbox: false },
    });

    cfgWindow.setMenuBarVisibility(false);
    cfgWindow.loadFile('config.html');

    cfgWindow.webContents.on('before-input-event', (_, input) => {
        if (input.type === 'keyDown' && input.key === 'F12') {
            cfgWindow.webContents.toggleDevTools();
        }
    });

    cfgWindow.once('ready-to-show', () => cfgWindow.show());
    cfgWindow.on('closed', () => { cfgWindow = null; });
}

// ─── Auto Updater ────────────────────────────────────────────────────────────

function setupAutoUpdater() {
    autoUpdater.autoDownload = false;

    autoUpdater.on('error', err =>
        console.warn(`[Updater] Non-fatal error: ${err.message}`)
    );
    autoUpdater.on('update-available', () =>
        mainWindow?.webContents.send('update_available')
    );
    autoUpdater.on('update-downloaded', () =>
        mainWindow?.webContents.send('update_downloaded')
    );

    autoUpdater.checkForUpdates().catch(err =>
        console.warn(`[Updater] Check failed: ${err.message}`)
    );
}

// ─── Download Handler ────────────────────────────────────────────────────────

function setupDownloadHandler() {
    mainWindow.webContents.session.on('will-download', (_, item) => {
        const urlChain = item.getURLChain();
        let meta = null;
        let matchedUrl = null;

        for (const url of urlChain) {
            if (pendingDownloads.has(url)) {
                meta = pendingDownloads.get(url);
                matchedUrl = url;
                break;
            }
        }

        if (!meta) return;

        const uniqueName = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}.zip`;
        const savePath = path.join(modulesPath, uniqueName);

        console.log(`[Download] "${meta.name}" -> ${savePath}`);
        item.setSavePath(savePath);

        item.on('updated', (__, state) => {
            if (state === 'interrupted') {
                console.warn(`[Download] Interrupted: ${meta.name}`);
                return;
            }
            if (state === 'progressing' && !item.isPaused()) {
                const total = item.getTotalBytes();
                const received = item.getReceivedBytes();
                const pct = total > 0 ? (received / total) * 100 : 0;
                mainWindow?.webContents.send('download-progress', pct);
            }
        });

        item.once('done', (__, state) => {
            if (matchedUrl) pendingDownloads.delete(matchedUrl);

            if (state === 'completed') {
                processDownloadedModule(savePath, meta);
            } else {
                console.error(`[Download] Failed with state: ${state}`);
                mainWindow?.webContents.send('download-error', `Download failed: ${state}`);
                safeUnlink(savePath);
            }
        });
    });
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
    createMainWindow();

    globalShortcut.register('CommandOrControl+Shift+I', () =>
        mainWindow?.webContents.toggleDevTools()
    );

    if (IS_DEV) {
        globalShortcut.register('CommandOrControl+R', () => {
            mainWindow?.reload();
            cfgWindow?.reload();
        });
        globalShortcut.register('CommandOrControl+D', () =>
            mainWindow?.webContents.openDevTools()
        );
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
});

app.on('window-all-closed', () => {
    if (!IS_MAC) app.quit();
});

// ─── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle('dark-mode:toggle', () => {
    const goLight = nativeTheme.shouldUseDarkColors;
    nativeTheme.themeSource = goLight ? 'light' : 'dark';
    return !goLight;
});

ipcMain.handle('get-version', () => app.getVersion());

ipcMain.handle('open-install-folder', () => shell.openPath(installPath));

ipcMain.handle('launch-game', (_, moduleName) => {
    if (!moduleName) return false;
    return launchGame(moduleName);
});

ipcMain.on('configWindow', (_, modulePath) => createConfigWindow(modulePath));
ipcMain.on('configWindowBack', () => cfgWindow?.close());

ipcMain.on('download', (_, url, meta) => {
    pendingDownloads.set(url, meta);
    mainWindow?.webContents.downloadURL(url);
});

ipcMain.on('restart_app', () => autoUpdater.quitAndInstall());
ipcMain.on('start_update', () => autoUpdater.downloadUpdate());

ipcMain.handle('get-modules', () => scanModules());

ipcMain.handle('remove-module', (_, modPath) => {
    try {
        if (!modPath || !fs.existsSync(modPath)) return false;

        const resolved = path.resolve(modPath);
        const resolvedModules = path.resolve(modulesPath);

        if (!resolved.startsWith(resolvedModules + path.sep)) {
            console.error(`[Security] Blocked removal outside modules path: ${resolved}`);
            return false;
        }

        fs.rmSync(resolved, { recursive: true, force: true });
        return true;
    } catch (err) {
        console.error('[remove-module] Error:', err);
        return false;
    }
});

ipcMain.handle('get-config-data', (_, selectedPath) => readConfigData(selectedPath));
ipcMain.handle('save-config-data', (_, { modulePath, configData }) => saveConfigData(modulePath, configData));

// Wine settings — persisted in userData/wine-settings.json
const WINE_SETTINGS_FILE = path.join(app.getPath('userData'), 'wine-settings.json');

function loadWineSettings() {
    try {
        if (fs.existsSync(WINE_SETTINGS_FILE)) {
            return JSON.parse(fs.readFileSync(WINE_SETTINGS_FILE, 'utf-8'));
        }
    } catch (err) {
        console.error('[Wine] Failed to load wine settings:', err);
    }
    return { winePath: 'wine', winePrefix: '' };
}

function saveWineSettings(settings) {
    try {
        fs.writeFileSync(WINE_SETTINGS_FILE, JSON.stringify(settings, null, 4), 'utf-8');
        return true;
    } catch (err) {
        console.error('[Wine] Failed to save wine settings:', err);
        return false;
    }
}

ipcMain.handle('get-wine-settings', () => loadWineSettings());

ipcMain.handle('set-wine-settings', (_, settings) => saveWineSettings(settings));

ipcMain.handle('browse-wine-executable', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Wine Executable',
        properties: ['openFile'],
        filters: [{ name: 'Executables', extensions: ['*'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
});

// ─── Game Launch ─────────────────────────────────────────────────────────────

function resolveExePath() {
    const candidates = [
        path.join(modulesPath, '..', GAME_EXE_NAME),
        path.join(installPath, GAME_EXE_NAME),
        path.join(process.cwd(), GAME_EXE_NAME),
    ];

    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }

    return candidates[0]; // Return first candidate for a clear "not found" error message
}

function launchGame(moduleName) {
    const exePath = resolveExePath();
    const workingDir = path.dirname(exePath);

    console.log(`[Launch] Module: "${moduleName}" | Exe: ${exePath} | Platform: ${process.platform}`);

    if (!fs.existsSync(exePath)) {
        const msg = `Executable not found: ${exePath}`;
        console.error(`[Launch] ${msg}`);
        mainWindow?.webContents.send('download-error', msg);
        return false;
    }

    // Pass module name as a discrete argv element so Node's spawn correctly
    // quotes arguments that contain spaces — fixing launch failures for module
    // folder names like "My Cool Mod".
    const gameArgs = ['--module', moduleName, '--no-intro'];

    let command;
    let finalArgs;

    if (IS_WINDOWS) {
        // Use the full absolute path so Windows always locates the exe,
        // regardless of PATH or CWD quirks.
        command = exePath;
        finalArgs = gameArgs;
    } else {
        // On Linux/macOS, delegate to Wine with the configured executable.
        const wineSettings = loadWineSettings();
        command = wineSettings.winePath || 'wine';
        finalArgs = [exePath, ...gameArgs];
    }

    const env = buildLaunchEnv();

    try {
        console.log(`[Launch] Spawning: ${command} ${finalArgs.map(a => JSON.stringify(a)).join(' ')}`);

        const gameProcess = spawn(command, finalArgs, {
            cwd: workingDir,
            detached: true,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        gameProcess.stdout.on('data', data =>
            data.toString().trim().split('\n').forEach(l => console.log(`[GAME/OUT] ${l}`))
        );
        gameProcess.stderr.on('data', data =>
            data.toString().trim().split('\n').forEach(l => console.error(`[GAME/ERR] ${l}`))
        );
        gameProcess.on('error', err => {
            console.error('[Launch] Spawn error:', err);
            mainWindow?.webContents.send('download-error', `Failed to launch: ${err.message}`);
        });

        const stableTimer = setTimeout(() => {
            if (gameProcess && !gameProcess.killed) {
                gameProcess.unref();
            }
        }, LAUNCH_STABLE_DELAY);

        gameProcess.on('exit', (code, signal) => {
            clearTimeout(stableTimer);
            console.log(`[Launch] Process exited - code: ${code}, signal: ${signal}`);

            if (code !== 0 && code !== null) {
                const msg = `Game exited with code ${code}. Check ${LOG_FILE_NAME} for details.`;
                console.error(`[Launch] ${msg}`);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('download-error', msg);
                }
            }
        });

        return true;
    } catch (err) {
        console.error('[Launch] Failed to spawn process:', err);
        return false;
    }
}

function buildLaunchEnv() {
    const env = { ...process.env };

    if (!IS_WINDOWS) {
        env.WINE_LARGE_ADDRESS_AWARE = '1';
        env.WINEDLLOVERRIDES = 'winegstreamer=d';
        env.LC_ALL = 'C';

        const wineSettings = loadWineSettings();
        if (wineSettings.winePrefix) {
            env.WINEPREFIX = wineSettings.winePrefix;
        }
    }

    return env;
}

// ─── Module Scanning ─────────────────────────────────────────────────────────

function scanModules() {
    if (!fs.existsSync(modulesPath)) return [];

    try {
        return fs.readdirSync(modulesPath)
            .map(name => {
                const fullPath = path.join(modulesPath, name);

                try {
                    if (!fs.statSync(fullPath).isDirectory()) return null;
                } catch {
                    return null;
                }

                const modData = {
                    name,
                    version: null,
                    path: fullPath,
                    hasImage: false,
                    imagePath: null,
                    configExists: false,
                };

                const versionFile = path.join(fullPath, VERSION_FILE);
                if (fs.existsSync(versionFile)) {
                    try {
                        modData.version = JSON.parse(fs.readFileSync(versionFile, 'utf-8')).version ?? null;
                    } catch (err) {
                        console.error(`[Modules] Failed to parse ${VERSION_FILE} for "${name}":`, err);
                    }
                }

                const imgPath = path.join(fullPath, MODULE_IMAGE_FILE);
                if (fs.existsSync(imgPath)) {
                    modData.hasImage = true;
                    modData.imagePath = imgPath;
                }

                modData.configExists = fs.existsSync(path.join(fullPath, MODULE_CONFIG_FILE));

                return modData;
            })
            .filter(Boolean);
    } catch (err) {
        console.error('[Modules] Scan error:', err);
        return [];
    }
}

// ─── Config ──────────────────────────────────────────────────────────────────

function readConfigData(selectedModulePath) {
    try {
        const targetPath = selectedModulePath || currentConfigModulePath;
        const schemaPath = path.join(__dirname, APP_CONFIG_FILE);

        let schema = {};
        if (fs.existsSync(schemaPath)) {
            try {
                schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
            } catch (err) {
                console.error('[Config] Failed to parse config.json:', err);
            }
        } else {
            console.error(`[Config] config.json not found at: ${schemaPath}`);
        }

        let values = {};

        if (targetPath) {
            const iniPath = path.join(targetPath, MODULE_CONFIG_FILE);

            if (fs.existsSync(iniPath)) {
                values = ini.parse(fs.readFileSync(iniPath, 'utf-8'));
            } else {
                console.log(`[Config] No INI found - generating defaults for "${targetPath}"`);
                for (const section in schema) {
                    values[section] = {};
                    for (const key in schema[section]) {
                        values[section][key] = schema[section][key]['default-value'];
                    }
                }
                try {
                    fs.writeFileSync(iniPath, ini.stringify(values), 'utf-8');
                    console.log('[Config] Default config written.');
                } catch (err) {
                    console.error('[Config] Failed to write default config:', err);
                }
            }
        } else {
            console.error('[Config] No module path provided to get-config-data.');
        }

        return { schema, values, modulePath: targetPath };
    } catch (err) {
        console.error('[Config] readConfigData error:', err);
        return { schema: {}, values: {}, error: err.message };
    }
}

function saveConfigData(modulePath, configData) {
    try {
        if (!modulePath) {
            console.error('[Config] save-config-data: no module path provided.');
            return false;
        }

        const resolved = path.resolve(modulePath);
        const resolvedModules = path.resolve(modulesPath);

        if (!resolved.startsWith(resolvedModules + path.sep)) {
            console.error(`[Security] Blocked config write outside modules path: ${resolved}`);
            throw new Error('Invalid module path');
        }

        const iniPath = path.join(modulePath, MODULE_CONFIG_FILE);
        fs.writeFileSync(iniPath, ini.stringify(configData), 'utf-8');
        console.log(`[Config] Saved to: ${iniPath}`);
        return true;
    } catch (err) {
        console.error('[Config] saveConfigData error:', err);
        return false;
    }
}

// ─── Module Installation ─────────────────────────────────────────────────────

function safeUnlink(filePath) {
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch { /* no-op */ }
}

async function hashFile(filePath, algorithm = 'md5') {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash(algorithm);
        const stream = fs.createReadStream(filePath);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

async function processDownloadedModule(zipPath, meta) {
    try {
        console.log(`[Install] Processing "${meta.name}"...`);

        // Integrity check
        if (meta.md5) {
            mainWindow?.webContents.send('download-progress', 100);
            console.log('[Install] Verifying MD5...');
            const localHash = await hashFile(zipPath);
            console.log(`[Install] MD5 - server: ${meta.md5}  local: ${localHash}`);
            if (localHash !== meta.md5) {
                throw new Error('Integrity check failed - file may be corrupted.');
            }
        }

        // Optional clean install
        if (meta.cleanInstall) {
            const targetDir = path.join(modulesPath, meta.name);
            console.log(`[Install] Clean install - removing: ${targetDir}`);
            try {
                if (fs.existsSync(targetDir)) {
                    fs.rmSync(targetDir, { recursive: true, force: true });
                }
            } catch (err) {
                console.error('[Install] Clean removal failed:', err);
            }
        }

        // Extract
        console.log('[Install] Extracting...');
        const zip = new AdmZip(zipPath);
        const entries = zip.getEntries();

        let rootFolderName = null;

        if (entries.length > 0) {
            const firstParts = entries[0].entryName.split('/');
            const potentialRoot = firstParts[0] + '/';
            const allUnderRoot = entries.every(
                e => e.entryName.startsWith(potentialRoot) || e.entryName === potentialRoot
            );
            if (firstParts.length > 1 && firstParts[0] && allUnderRoot) {
                rootFolderName = firstParts[0];
            }
        }

        const targetModuleDir = path.join(modulesPath, meta.name);

        if (!rootFolderName) {
            // Flat zip - extract directly into the module folder
            fs.mkdirSync(targetModuleDir, { recursive: true });
            zip.extractAllTo(targetModuleDir, true);
        } else if (rootFolderName === meta.name) {
            // Root folder already matches the module name
            zip.extractAllTo(modulesPath, true);
        } else {
            // Root folder has a different name - extract to temp, then rename/merge
            const tempDir = path.join(modulesPath, `_tmp_${Date.now()}`);
            zip.extractAllTo(tempDir, true);

            const extractedRoot = path.join(tempDir, rootFolderName);

            if (!fs.existsSync(targetModuleDir)) {
                fs.renameSync(extractedRoot, targetModuleDir);
            } else {
                for (const file of fs.readdirSync(extractedRoot)) {
                    fs.cpSync(
                        path.join(extractedRoot, file),
                        path.join(targetModuleDir, file),
                        { recursive: true, force: true }
                    );
                }
            }

            fs.rmSync(tempDir, { recursive: true, force: true });
        }

        // Write version.json
        if (meta.name && meta.version && fs.existsSync(targetModuleDir)) {
            try {
                fs.writeFileSync(
                    path.join(targetModuleDir, VERSION_FILE),
                    JSON.stringify({ version: meta.version }, null, 4)
                );
            } catch (err) {
                console.error('[Install] Failed to write version.json:', err);
            }
        }

        mainWindow?.webContents.send('download-complete');
        console.log(`[Install] "${meta.name}" installed successfully.`);
    } catch (err) {
        console.error('[Install] Failed:', err);
        mainWindow?.webContents.send('download-error', err.message);
    } finally {
        setTimeout(() => safeUnlink(zipPath), 1000);
    }
}
