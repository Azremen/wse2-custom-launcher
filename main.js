'use strict';

const { app, BrowserWindow, ipcMain, nativeTheme, globalShortcut, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const ini = require('ini');
const crypto = require('crypto');
const { spawn } = require('child_process');
const log = require('electron-log');

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

// ─── Logger (electron-log) ───────────────────────────────────────────────────

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
        let finalPath;

        try {
            fs.writeFileSync(candidatePath, '');
            finalPath = candidatePath;
        } catch {
            finalPath = IS_LINUX
                ? path.join('/tmp', LOG_FILE_NAME)
                : path.join(app.getPath('userData'), LOG_FILE_NAME);
        }

        log.transports.file.resolvePathFn = () => finalPath;
        log.transports.file.level = 'silly';
        log.transports.console.level = IS_DEV ? 'silly' : false;
    } catch (err) {
        // Can't log this — nowhere to write yet
    }
})();

// Override console methods so all existing console.log/warn/error calls
// automatically go through electron-log and are forwarded to the renderer.
console.log   = (...args) => { log.info(...args); };
console.warn  = (...args) => { log.warn(...args);  sendLogToRenderer('WARN',  args); };
console.error = (...args) => { log.error(...args); sendLogToRenderer('ERROR', args); };

function sendLogToRenderer(level, args) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const message = args
        .map(a => (a !== null && typeof a === 'object' ? JSON.stringify(a) : String(a)))
        .join(' ');
    const time = new Date().toISOString();
    try { mainWindow.webContents.send('app-log', { level, message, time }); } catch { /* no-op */ }
}

process.on('uncaughtException', err => console.error('CRITICAL - Uncaught Exception:', err));
process.on('unhandledRejection', (reason) => console.error('CRITICAL - Unhandled Rejection:', reason));

console.log('[Launcher] Starting...');

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

async function resolveModulesPath() {
    const candidates = [
        process.env.PORTABLE_EXECUTABLE_DIR && path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'Modules'),
        path.join(installPath, 'Modules'),
        path.join(process.cwd(), 'Modules'),
        path.join(installPath, '..', 'Modules'),
    ].filter(Boolean);

    for (const candidate of candidates) {
        try {
            const stat = await fs.promises.stat(candidate);
            if (stat.isDirectory()) {
                console.log(`[Paths] Modules found at: ${candidate}`);
                return candidate;
            }
        } catch { /* not found */ }
    }

    const fallback = path.join(installPath, 'Modules');
    console.log(`[Paths] No existing Modules directory found. Using default: ${fallback}`);
    return fallback;
}

let modulesPath = path.join(installPath, 'Modules'); // initial default; overwritten in app.whenReady

async function ensureModulesDirectory() {
    try {
        await fs.promises.mkdir(modulesPath, { recursive: true });
        const testFile = path.join(modulesPath, WRITE_TEST_FILE_NAME);
        await fs.promises.writeFile(testFile, 'test');
        await fs.promises.unlink(testFile);
    } catch (writeErr) {
        console.warn('[Paths] Modules directory is not writable. Updates may require elevated privileges.', writeErr);
    }
}

// ─── Window Management ───────────────────────────────────────────────────────

/** @type {BrowserWindow | null} */
let mainWindow = null;

/** @type {BrowserWindow | null} */
let cfgWindow = null;

/** @type {string | null} */
let currentConfigModulePath = null;

/** @type {Map<string, object>} */
const pendingDownloads = new Map();

/** @type {import('electron').DownloadItem | null} */
let activeDownloadItem = null;

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
        webPreferences: { ...SHARED_WEB_PREFERENCES },
    });

    cfgWindow.setMenuBarVisibility(false);
    cfgWindow.loadFile('config.html');

    if (IS_DEV) {
        cfgWindow.webContents.on('before-input-event', (_, input) => {
            if (input.type === 'keyDown' && input.key === 'F12') {
                cfgWindow.webContents.toggleDevTools();
            }
        });
    }

    cfgWindow.once('ready-to-show', () => cfgWindow.show());
    cfgWindow.on('closed', () => { cfgWindow = null; });
}

// ─── Auto Updater ────────────────────────────────────────────────────────────

function setupAutoUpdater() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on('error', err =>
        console.warn(`[Updater] Non-fatal error: ${err.message}`)
    );
    autoUpdater.on('update-available', () =>
        mainWindow?.webContents.send('update_available')
    );
    autoUpdater.on('download-progress', (info) =>
        mainWindow?.webContents.send('update_download_progress', Math.round(info.percent))
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

        if (!meta) {
            item.cancel();
            return;
        }

        const uniqueName = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}.zip`;
        const savePath = path.join(modulesPath, uniqueName);

        console.log(`[Download] "${meta.name}" -> ${savePath}`);
        item.setSavePath(savePath);
        activeDownloadItem = item;

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
            activeDownloadItem = null;
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

app.whenReady().then(async () => {
    modulesPath = await resolveModulesPath();
    await ensureModulesDirectory();

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

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
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

ipcMain.handle('configWindow', (_, modulePath) => createConfigWindow(modulePath));
ipcMain.handle('configWindowBack', () => cfgWindow?.close());

ipcMain.handle('download', (_, url, meta) => {
    pendingDownloads.set(url, meta);
    mainWindow?.webContents.downloadURL(url);
});

ipcMain.handle('restart_app', () => autoUpdater.quitAndInstall());
ipcMain.handle('start_update', () => autoUpdater.downloadUpdate());
ipcMain.handle('check-for-updates', async () => {
    try {
        const result = await autoUpdater.checkForUpdates();
        const remoteVersion = result?.updateInfo?.version;
        const hasUpdate = !!remoteVersion && remoteVersion !== app.getVersion();
        return { hasUpdate };
    } catch (err) {
        console.warn(`[Updater] Manual check failed: ${err.message}`);
        return { hasUpdate: false, error: err.message };
    }
});

ipcMain.handle('cancel-download', () => {
    if (activeDownloadItem) {
        try { activeDownloadItem.cancel(); } catch { /* no-op */ }
        activeDownloadItem = null;
        return true;
    }
    return false;
});

ipcMain.handle('get-auto-launch', () => {
    try { return app.getLoginItemSettings().openAtLogin; }
    catch { return false; }
});

ipcMain.handle('set-auto-launch', (_, enabled) => {
    try {
        app.setLoginItemSettings({ openAtLogin: !!enabled });
        return true;
    } catch (err) {
        console.error('[AutoLaunch] Failed:', err);
        return false;
    }
});

ipcMain.handle('get-modules', async () => scanModules());

ipcMain.handle('remove-module', async (_, modPath) => {
    try {
        if (!modPath) {
            console.error('[remove-module] No path provided.');
            return false;
        }

        const resolved        = path.resolve(modPath);
        const resolvedModules = path.resolve(modulesPath);

        // Ensure the target is a direct child of modulesPath (not the root itself)
        const rel = path.relative(resolvedModules, resolved);
        const isDirectChild = rel && !rel.startsWith('..') && !path.isAbsolute(rel) && !rel.includes(path.sep);
        if (!isDirectChild) {
            console.error(`[Security] Blocked removal outside modules path: ${resolved}`);
            return false;
        }

        try {
            await fs.promises.access(resolved);
        } catch {
            console.warn(`[remove-module] Path does not exist (already removed?): ${resolved}`);
            return true; // Treat as success — it's gone either way
        }

        await fs.promises.rm(resolved, { recursive: true, force: true });
        console.log(`[remove-module] Removed: ${resolved}`);
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

async function loadWineSettings() {
    try {
        const raw = await fs.promises.readFile(WINE_SETTINGS_FILE, 'utf-8');
        return JSON.parse(raw);
    } catch (err) {
        if (err.code !== 'ENOENT') console.error('[Wine] Failed to load wine settings:', err);
    }
    return { winePath: 'wine', winePrefix: '' };
}

async function saveWineSettings(settings) {
    try {
        await fs.promises.writeFile(WINE_SETTINGS_FILE, JSON.stringify(settings, null, 4), 'utf-8');
        return true;
    } catch (err) {
        console.error('[Wine] Failed to save wine settings:', err);
        return false;
    }
}

ipcMain.handle('get-wine-settings', () => loadWineSettings());

ipcMain.handle('set-wine-settings', (_, settings) => saveWineSettings(settings));

ipcMain.handle('browse-wine-executable', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Wine Executable',
        properties: ['openFile'],
        filters: [{ name: 'Executables', extensions: ['*'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
});

// ─── Game Launch ─────────────────────────────────────────────────────────────

async function resolveExePath() {
    const candidates = [
        path.join(modulesPath, '..', GAME_EXE_NAME),
        path.join(installPath, GAME_EXE_NAME),
        path.join(process.cwd(), GAME_EXE_NAME),
    ];

    for (const p of candidates) {
        try { await fs.promises.access(p); return p; } catch { /* not found */ }
    }

    return candidates[0]; // Return first candidate for a clear "not found" error message
}

async function launchGame(moduleName) {
    const exePath = await resolveExePath();
    const workingDir = path.dirname(exePath);

    console.log(`[Launch] Module: "${moduleName}" | Exe: ${exePath} | Platform: ${process.platform}`);

    try {
        await fs.promises.access(exePath);
    } catch {
        const msg = `Executable not found: ${exePath}`;
        console.error(`[Launch] ${msg}`);
        mainWindow?.webContents.send('app-error', msg);
        return false;
    }

    // Pass module name as a discrete argv element so Node's spawn correctly
    // quotes arguments that contain spaces — fixing launch failures for module
    // folder names like "My Cool Mod".
    const gameArgs = ['--module', moduleName, '--no-intro'];

    let command;
    let finalArgs;
    let wineSettings = null;

    if (IS_WINDOWS) {
        // Use the full absolute path so Windows always locates the exe,
        // regardless of PATH or CWD quirks.
        command = exePath;
        finalArgs = gameArgs;
    } else {
        // On Linux/macOS, delegate to Wine with the configured executable.
        wineSettings = await loadWineSettings();
        command = wineSettings.winePath || 'wine';
        finalArgs = [exePath, ...gameArgs];
    }

    const env = await buildLaunchEnv(wineSettings);

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
            clearTimeout(stableTimer);
            console.error('[Launch] Spawn error:', err);
            mainWindow?.webContents.send('app-error', `Failed to launch: ${err.message}`);
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
                    mainWindow.webContents.send('app-error', msg);
                }
            }
        });

        return true;
    } catch (err) {
        console.error('[Launch] Failed to spawn process:', err);
        mainWindow?.webContents.send('app-error', `Failed to launch: ${err.message}`);
        return false;
    }
}

async function buildLaunchEnv(wineSettings = null) {
    const env = { ...process.env };

    if (!IS_WINDOWS) {
        env.WINE_LARGE_ADDRESS_AWARE = '1';
        env.WINEDLLOVERRIDES = 'winegstreamer=d';
        env.LC_ALL = 'C';

        const settings = wineSettings || await loadWineSettings();
        if (settings.winePrefix) {
            env.WINEPREFIX = settings.winePrefix;
        }
    }

    return env;
}

// ─── Module Scanning ─────────────────────────────────────────────────────────

async function scanModules() {
    try {
        await fs.promises.access(modulesPath);
    } catch {
        return [];
    }

    try {
        const names = await fs.promises.readdir(modulesPath);
        const results = await Promise.all(names.map(async name => {
            // Skip temporary extraction directories
            if (name.startsWith('_tmp_')) return null;

            const fullPath = path.join(modulesPath, name);

            try {
                const stat = await fs.promises.stat(fullPath);
                if (!stat.isDirectory()) return null;
            } catch { return null; }

            const modData = {
                name,
                version: null,
                path: fullPath,
                imagePath: null,
                configExists: false,
            };

            const versionFile = path.join(fullPath, VERSION_FILE);
            try {
                const raw = await fs.promises.readFile(versionFile, 'utf-8');
                modData.version = JSON.parse(raw).version ?? null;
            } catch (err) {
                if (err.code !== 'ENOENT') console.error(`[Modules] Failed to parse ${VERSION_FILE} for "${name}":`, err);
            }

            const imgPath = path.join(fullPath, MODULE_IMAGE_FILE);
            try {
                await fs.promises.access(imgPath);
                modData.imagePath = imgPath;
            } catch { /* no image */ }

            try {
                await fs.promises.access(path.join(fullPath, MODULE_CONFIG_FILE));
                modData.configExists = true;
            } catch { /* no config */ }

            return modData;
        }));
        return results.filter(Boolean);
    } catch (err) {
        console.error('[Modules] Scan error:', err);
        return [];
    }
}

// ─── Config ──────────────────────────────────────────────────────────────────

async function readConfigData(selectedModulePath) {
    try {
        const targetPath = selectedModulePath || currentConfigModulePath;
        const schemaPath = path.join(__dirname, APP_CONFIG_FILE);

        let schema = {};
        try {
            const raw = await fs.promises.readFile(schemaPath, 'utf-8');
            schema = JSON.parse(raw);
        } catch (err) {
            if (err.code === 'ENOENT') {
                console.error(`[Config] config.json not found at: ${schemaPath}`);
            } else {
                console.error('[Config] Failed to parse config.json:', err);
            }
        }

        let values = {};

        if (targetPath) {
            const iniPath = path.join(targetPath, MODULE_CONFIG_FILE);

            try {
                const raw = await fs.promises.readFile(iniPath, 'utf-8');
                values = ini.parse(raw);
            } catch (err) {
                if (err.code === 'ENOENT') {
                    console.log(`[Config] No INI found - generating defaults for "${targetPath}"`);
                    for (const section in schema) {
                        values[section] = {};
                        for (const key in schema[section]) {
                            values[section][key] = schema[section][key]['default-value'];
                        }
                    }
                    try {
                        await fs.promises.writeFile(iniPath, ini.stringify(values), 'utf-8');
                        console.log('[Config] Default config written.');
                    } catch (writeErr) {
                        console.error('[Config] Failed to write default config:', writeErr);
                    }
                } else {
                    throw err;
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

async function saveConfigData(modulePath, configData) {
    try {
        if (!modulePath) {
            console.error('[Config] save-config-data: no module path provided.');
            return false;
        }

        const resolved        = path.resolve(modulePath);
        const resolvedModules = path.resolve(modulesPath);

        const rel = path.relative(resolvedModules, resolved);
        const isDirectChild = rel && !rel.startsWith('..') && !path.isAbsolute(rel) && !rel.includes(path.sep);
        if (!isDirectChild) {
            console.error(`[Security] Blocked config write outside modules path: ${resolved}`);
            throw new Error('Invalid module path');
        }

        const iniPath = path.join(modulePath, MODULE_CONFIG_FILE);
        await fs.promises.writeFile(iniPath, ini.stringify(configData), 'utf-8');
        console.log(`[Config] Saved to: ${iniPath}`);
        return true;
    } catch (err) {
        console.error('[Config] saveConfigData error:', err);
        return false;
    }
}

// ─── Module Installation ─────────────────────────────────────────────────────

async function safeUnlink(filePath) {
    try { await fs.promises.unlink(filePath); } catch { /* no-op */ }
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
                await fs.promises.rm(targetDir, { recursive: true, force: true });
            } catch (err) {
                console.error('[Install] Clean removal failed:', err);
            }
        }

        // Extract
        console.log('[Install] Extracting...');
        const zip = new AdmZip(zipPath);

        // Detect root folder using only the first few entries to avoid loading all metadata
        const entries = zip.getEntries();
        const sampleEntries = entries.slice(0, 20);
        let rootFolderName = null;

        if (sampleEntries.length > 0) {
            const firstParts = sampleEntries[0].entryName.split('/');
            const potentialRoot = firstParts[0] + '/';
            const allUnderRoot = sampleEntries.every(
                e => e.entryName.startsWith(potentialRoot) || e.entryName === potentialRoot
            );
            if (firstParts.length > 1 && firstParts[0] && allUnderRoot) {
                rootFolderName = firstParts[0];
            }
        }

        const targetModuleDir = path.join(modulesPath, meta.name);
        let tempDir = null;

        if (!rootFolderName) {
            // Flat zip - extract directly into the module folder
            await fs.promises.mkdir(targetModuleDir, { recursive: true });
            await new Promise((resolve, reject) =>
                zip.extractAllToAsync(targetModuleDir, true, false, err => err ? reject(err) : resolve())
            );
        } else if (rootFolderName === meta.name) {
            // Root folder already matches the module name
            await new Promise((resolve, reject) =>
                zip.extractAllToAsync(modulesPath, true, false, err => err ? reject(err) : resolve())
            );
        } else {
            // Root folder has a different name - extract to temp, then rename/merge
            tempDir = path.join(modulesPath, `_tmp_${Date.now()}`);
            await new Promise((resolve, reject) =>
                zip.extractAllToAsync(tempDir, true, false, err => err ? reject(err) : resolve())
            );

            const extractedRoot = path.join(tempDir, rootFolderName);

            try {
                await fs.promises.access(targetModuleDir);
                // Dir exists — merge
                const files = await fs.promises.readdir(extractedRoot);
                await Promise.all(files.map(file =>
                    fs.promises.cp(
                        path.join(extractedRoot, file),
                        path.join(targetModuleDir, file),
                        { recursive: true, force: true }
                    )
                ));
            } catch {
                // Dir doesn't exist — rename
                await fs.promises.rename(extractedRoot, targetModuleDir);
            }

            await fs.promises.rm(tempDir, { recursive: true, force: true });
        }

        // Write version.json
        if (meta.name && meta.version) {
            try {
                await fs.promises.access(targetModuleDir);
                await fs.promises.writeFile(
                    path.join(targetModuleDir, VERSION_FILE),
                    JSON.stringify({ version: meta.version }, null, 4)
                );
            } catch (err) {
                if (err.code !== 'ENOENT') console.error('[Install] Failed to write version.json:', err);
            }
        }

        mainWindow?.webContents.send('download-complete');
        console.log(`[Install] "${meta.name}" installed successfully.`);
    } catch (err) {
        console.error('[Install] Failed:', err);
        mainWindow?.webContents.send('download-error', err.message);
    } finally {
        setTimeout(() => safeUnlink(zipPath), 1000);
        if (tempDir) setTimeout(() => fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {}), 1000);
    }
}
