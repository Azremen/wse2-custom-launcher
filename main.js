'use strict';

const { app, BrowserWindow, ipcMain, nativeTheme, globalShortcut, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const extract = require('extract-zip');
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
const MODULE_MANIFEST_FILE = 'module_manifest.json';
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
        } else if (IS_WINDOWS && process.env.PORTABLE_EXECUTABLE_DIR) {
            // Portable build: write log next to the exe, not in the temp extraction dir.
            logDir = process.env.PORTABLE_EXECUTABLE_DIR;
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
        // Nowhere to write yet — silently ignore
    }
})();

// Route all console calls through electron-log and forward to the renderer.
console.log = (...args) => { log.info(...args); };
console.warn = (...args) => { log.warn(...args); sendLogToRenderer('WARN', args); };
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
    // Portable build: resolve to the actual exe directory, not the temp extraction path.
    if (IS_WINDOWS && process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;

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

/** @type {boolean} */
let pendingUpdateAvailable = false;

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
    } else {
        // Disable DevTools shortcuts in production.
        mainWindow.webContents.on('before-input-event', (event, input) => {
            if (input.type !== 'keyDown') return;
            const ctrl = input.control || input.meta;
            if (
                input.key === 'F12' ||
                input.key === 'F5' ||
                (ctrl && (input.key === 'r' || input.key === 'R')) ||
                (ctrl && input.shift && (input.key === 'i' || input.key === 'I'))
            ) {
                event.preventDefault();
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
    } else {
        // Disable DevTools shortcuts in production.
        cfgWindow.webContents.on('before-input-event', (event, input) => {
            if (input.type !== 'keyDown') return;
            const ctrl = input.control || input.meta;
            if (
                input.key === 'F12' ||
                input.key === 'F5' ||
                (ctrl && (input.key === 'r' || input.key === 'R')) ||
                (ctrl && input.shift && (input.key === 'i' || input.key === 'I'))
            ) {
                event.preventDefault();
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
    {
        pendingUpdateAvailable = true;
        mainWindow?.webContents.send('update_available');
    }
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

        // Track retries across repeated will-download attempts for the same URL.
        meta._retryCount = Number(meta._retryCount || 0);

        console.log(`[Download] "${meta.name}" -> ${savePath}`);
        item.setSavePath(savePath);
        activeDownloadItem = item;

        item.on('updated', (__, state) => {
            if (state === 'interrupted') {
                console.warn(`[Download] Interrupted: ${meta.name}`);
                if (item.canResume()) {
                    try {
                        item.resume();
                        console.log(`[Download] Resume requested: ${meta.name}`);
                    } catch (err) {
                        console.warn(`[Download] Resume failed for ${meta.name}: ${err.message}`);
                    }
                }
                return;
            }
            if (state === 'progressing' && !item.isPaused()) {
                const total = item.getTotalBytes();
                const received = item.getReceivedBytes();
                const expected = total > 0 ? total : Number(meta.size || 0);
                const pct = expected > 0 ? Math.min((received / expected) * 100, 99.9) : 0;
                mainWindow?.webContents.send('download-progress', pct);
            }
        });

        item.once('done', (__, state) => {
            activeDownloadItem = null;

            if (state === 'completed') {
                if (matchedUrl) pendingDownloads.delete(matchedUrl);
                processDownloadedModule(savePath, meta);
            } else if (state === 'interrupted' && matchedUrl && meta._retryCount < 1) {
                meta._retryCount += 1;
                console.warn(`[Download] Retrying (${meta._retryCount}) for: ${meta.name}`);
                safeUnlink(savePath);
                mainWindow?.webContents.downloadURL(matchedUrl);
            } else {
                if (matchedUrl) pendingDownloads.delete(matchedUrl);
                const received = item.getReceivedBytes();
                const total = item.getTotalBytes();
                const detail = `${state} (${received}/${total} bytes)`;
                console.error(`[Download] Failed with state: ${detail}`);
                mainWindow?.webContents.send('download-error', `Download failed: ${detail}`);
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

    if (IS_DEV) {
        globalShortcut.register('CommandOrControl+Shift+I', () =>
            mainWindow?.webContents.toggleDevTools()
        );
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
        pendingUpdateAvailable = pendingUpdateAvailable || hasUpdate;
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

        const resolved = path.resolve(modPath);
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
    return { winePath: 'wine', winePrefix: '', gameLanguage: '' };
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

ipcMain.handle('get-game-languages', async () => {
    const exePath = await resolveExePath();
    const gameDir = path.dirname(exePath);

    const dirsToScan = [
        path.join(gameDir, 'languages'),
        path.join(gameDir, 'Languages'),
        path.join(gameDir, 'Data', 'languages'),
        path.join(gameDir, 'Data', 'Languages'),
    ];

    const langSet = new Set();
    for (const dir of dirsToScan) {
        try {
            const entries = await fs.promises.readdir(dir, { withFileTypes: true });
            entries.filter(e => e.isDirectory()).forEach(e => langSet.add(e.name));
        } catch { /* directory doesn't exist, skip */ }
    }

    const langs = [...langSet].sort();
    return langs.length > 0 ? langs : ['en'];
});

ipcMain.handle('browse-wine-executable', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Wine Executable',
        properties: ['openFile'],
        filters: [{ name: 'Executables', extensions: ['*'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
});

// ─── DXVK Management ─────────────────────────────────────────────────────────

function spawnAsync(cmd, args, options = {}) {
    return new Promise(resolve => {
        const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
        let output = '';
        proc.stdout?.on('data', d => { output += d.toString(); });
        proc.stderr?.on('data', d => { output += d.toString(); });
        proc.on('error', err => resolve({ code: -1, output: err.message }));
        proc.on('exit', code => resolve({ code, output }));
    });
}

ipcMain.handle('check-dxvk', async () => {
    if (!IS_LINUX) return { available: false, installed: false };

    // Check if setup_dxvk is in PATH
    const which = await spawnAsync('which', ['setup_dxvk']);
    const available = which.code === 0;

    const settings = await loadWineSettings();
    const prefix = settings.winePrefix || path.join(process.env.HOME || '', '.wine');

    // Compare file sizes: if prefix dll matches system DXVK dll, it's installed
    const systemDll = '/usr/share/dxvk/x32/d3d9.dll';
    const prefixDll = path.join(prefix, 'dosdevices/c:/windows/syswow64/d3d9.dll');

    let installed = false;
    try {
        const [sysStat, prefStat] = await Promise.all([
            fs.promises.stat(systemDll),
            fs.promises.stat(prefixDll),
        ]);
        installed = sysStat.size === prefStat.size;
    } catch { /* files don't exist */ }

    return { available, installed };
});

ipcMain.handle('install-dxvk', async () => {
    if (!IS_LINUX) return { success: false, error: 'Not applicable on this platform' };

    const settings = await loadWineSettings();
    const env = { ...process.env };
    if (settings.winePrefix) env.WINEPREFIX = settings.winePrefix;

    console.log('[DXVK] Running setup_dxvk install...');
    const result = await spawnAsync('setup_dxvk', ['install'], { env });
    const success = result.code === 0;
    console.log(`[DXVK] Installation ${success ? 'succeeded' : 'failed'}:\n${result.output}`);
    return { success, output: result.output };
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

    const launchSettings = await loadWineSettings();

    let command;
    let finalArgs;
    let wineSettings = null;

    if (IS_WINDOWS) {
        // Spread module name words as separate argv elements + windowsVerbatimArguments
        // so Node.js doesn't add quotes. Mirrors how the C++ launcher calls CreateProcess.
        command = exePath;
        finalArgs = ['--module', ...moduleName.split(' '), '--no-intro'];
    } else {
        // Wine joins argv with spaces when building the Windows command line,
        // so spreading module name words avoids unwanted quoting.
        wineSettings = launchSettings;
        command = wineSettings.winePath || 'wine';
        finalArgs = [exePath, '--module', ...moduleName.split(' '), '--no-intro'];
    }

    const env = await buildLaunchEnv(wineSettings);

    // Write language.txt before launch so the game picks up the selected language.
    if (launchSettings.gameLanguage) {
        await writeGameLanguage(launchSettings);
    }

    try {
        const displayCmd = IS_WINDOWS
            ? `${command} ${finalArgs.join(' ')}`
            : `${command} ${finalArgs.map(a => /\s/.test(a) ? `"${a}"` : a).join(' ')}`;
        console.log(`[Launch] Spawning: ${displayCmd}`);

        const gameProcess = spawn(command, finalArgs, {
            cwd: workingDir,
            detached: true,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsVerbatimArguments: IS_WINDOWS,
        });

        gameProcess.stdout.on('data', data =>
            data.toString().trim().split('\n').forEach(l => console.log(`[GAME/OUT] ${l}`))
        );
        gameProcess.stderr.on('data', data =>
            data.toString().trim().split('\n').forEach(l => {
                if (/^(fixme:|info:|warn:)/.test(l)) console.warn(`[GAME/WINE] ${l}`);
                else console.error(`[GAME/ERR] ${l}`);
            })
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

        env.WINEDEBUG = '-all';
    }

    return env;
}

async function writeGameLanguage(settings) {
    try {
        let langFilePath;

        if (IS_WINDOWS) {
            const appData = process.env.APPDATA;
            if (!appData) return;
            langFilePath = path.join(appData, 'Mount&Blade Warband WSE2', 'language.txt');
        } else {
            const prefix = settings.winePrefix || path.join(process.env.HOME || '', '.wine');
            const usersDir = path.join(prefix, 'drive_c', 'users');
            // Find the language.txt under any user directory
            let found = null;
            try {
                const userDirs = await fs.promises.readdir(usersDir);
                for (const u of userDirs) {
                    const candidate = path.join(usersDir, u, 'AppData', 'Roaming', 'Mount&Blade Warband WSE2', 'language.txt');
                    try { await fs.promises.access(candidate); found = candidate; break; } catch { /* next */ }
                }
            } catch { /* can't read users dir */ }

            if (!found) {
                // File doesn't exist yet — create it under first user directory
                try {
                    const userDirs = await fs.promises.readdir(usersDir);
                    const firstUser = userDirs.find(u => u !== 'Public' && u !== 'Default');
                    if (firstUser) {
                        const dir = path.join(usersDir, firstUser, 'AppData', 'Roaming', 'Mount&Blade Warband WSE2');
                        await fs.promises.mkdir(dir, { recursive: true });
                        found = path.join(dir, 'language.txt');
                    }
                } catch { /* skip */ }
            }

            if (!found) return;
            langFilePath = found;
        }

        await fs.promises.writeFile(langFilePath, settings.gameLanguage, 'utf-8');
        console.log(`[Language] Written "${settings.gameLanguage}" to ${langFilePath}`);
    } catch (err) {
        console.warn('[Language] Failed to write language.txt:', err.message);
    }
}

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
                manifest: null,
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

            const manifestFile = path.join(fullPath, MODULE_MANIFEST_FILE);
            try {
                const raw = await fs.promises.readFile(manifestFile, 'utf-8');
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object' && parsed.files && typeof parsed.files === 'object') {
                    modData.manifest = parsed;
                }
            } catch (err) {
                if (err.code !== 'ENOENT') console.error(`[Modules] Failed to parse ${MODULE_MANIFEST_FILE} for "${name}":`, err);
            }

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
            // Build defaults from schema first, then overlay saved INI values.
            // This way the form is always fully populated even when the INI only
            // contains a handful of non-default overrides.
            for (const section in schema) {
                values[section] = {};
                for (const key in schema[section]) {
                    values[section][key] = schema[section][key]['default-value'];
                }
            }

            const iniPath = path.join(targetPath, MODULE_CONFIG_FILE);
            try {
                const raw = await fs.promises.readFile(iniPath, 'utf-8');
                const saved = ini.parse(raw);
                for (const section in saved) {
                    if (!values[section]) values[section] = {};
                    for (const key in saved[section]) {
                        values[section][key] = saved[section][key];
                    }
                }
            } catch (err) {
                if (err.code !== 'ENOENT') throw err;
                // No INI yet — defaults are already set above, nothing to write.
                console.log(`[Config] No INI found - using defaults for "${targetPath}"`);
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

        const resolved = path.resolve(modulePath);
        const resolvedModules = path.resolve(modulesPath);

        const rel = path.relative(resolvedModules, resolved);
        const isDirectChild = rel && !rel.startsWith('..') && !path.isAbsolute(rel) && !rel.includes(path.sep);
        if (!isDirectChild) {
            console.error(`[Security] Blocked config write outside modules path: ${resolved}`);
            throw new Error('Invalid module path');
        }

        // Read defaults from config.json schema so we only persist values that
        // differ from the default — keeps the INI file minimal and readable.
        let schema = {};
        try {
            const raw = await fs.promises.readFile(path.join(__dirname, APP_CONFIG_FILE), 'utf-8');
            schema = JSON.parse(raw);
        } catch { /* proceed without defaults — save everything */ }

        const toWrite = {};
        for (const section in configData) {
            for (const key in configData[section]) {
                const defaultVal = schema[section]?.[key]?.['default-value'];
                const val = configData[section][key];
                // Loose equality covers number/string coercion from INI parsing
                // eslint-disable-next-line eqeqeq
                if (defaultVal === undefined || val != defaultVal) {
                    if (!toWrite[section]) toWrite[section] = {};
                    toWrite[section][key] = val;
                }
            }
        }

        const iniPath = path.join(modulePath, MODULE_CONFIG_FILE);
        const hasNonDefaults = Object.values(toWrite).some(s => Object.keys(s).length > 0);

        let fileExists = true;
        try { await fs.promises.access(iniPath); } catch { fileExists = false; }

        if (!fileExists && !hasNonDefaults) {
            console.log(`[Config] All values are default and no INI exists — skipping save.`);
            return true;
        }

        await fs.promises.writeFile(iniPath, ini.stringify(toWrite), 'utf-8');
        console.log(`[Config] Saved ${Object.values(toWrite).reduce((n, s) => n + Object.keys(s).length, 0)} non-default value(s) to: ${iniPath}`);
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

function normalizeRelativePath(filePath) {
    return String(filePath || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function manifestToMap(manifest) {
    const map = new Map();
    if (!manifest || typeof manifest !== 'object') return map;

    if (Array.isArray(manifest.files)) {
        for (const entry of manifest.files) {
            if (!entry || typeof entry !== 'object') continue;
            const relPath = normalizeRelativePath(entry.path || entry.name);
            if (!relPath) continue;
            const sha256 = String(entry.sha256 || entry.hash || '').toLowerCase();
            if (sha256.length !== 64) continue;
            map.set(relPath, sha256);
        }
    } else if (manifest.files && typeof manifest.files === 'object') {
        for (const [relPathRaw, hash] of Object.entries(manifest.files)) {
            const relPath = normalizeRelativePath(relPathRaw);
            if (!relPath) continue;
            const sha256 = String(hash || '').toLowerCase();
            if (sha256.length !== 64) continue;
            map.set(relPath, sha256);
        }
    }

    return map;
}

async function readStoredManifest(moduleDir) {
    const manifestPath = path.join(moduleDir, MODULE_MANIFEST_FILE);
    try {
        const raw = await fs.promises.readFile(manifestPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.files && typeof parsed.files === 'object') {
            return parsed;
        }
    } catch (err) {
        if (err.code !== 'ENOENT') console.error(`[Install] Failed to read ${MODULE_MANIFEST_FILE}:`, err);
    }
    return null;
}

async function writeModuleManifest(moduleDir, manifest, version) {
    const manifestPath = path.join(moduleDir, MODULE_MANIFEST_FILE);
    const payload = {
        version: version ?? null,
        generatedAt: new Date().toISOString(),
        files: manifestToObject(manifest)
    };
    await fs.promises.writeFile(manifestPath, JSON.stringify(payload, null, 4));
}

function manifestToObject(manifest) {
    const obj = {};
    for (const [relPath, hash] of manifestToMap(manifest).entries()) {
        obj[relPath] = hash;
    }
    return obj;
}

async function copyFileEnsuringDirectory(sourcePath, targetPath) {
    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.copyFile(sourcePath, targetPath);
}

async function removeFileIfExists(filePath) {
    try {
        await fs.promises.unlink(filePath);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
}

async function syncModuleFiles(sourceDir, targetDir, remoteManifest, installedManifest) {
    const remoteMap = manifestToMap(remoteManifest);
    const installedMap = manifestToMap(installedManifest);
    let copiedCount = 0;
    let skippedCount = 0;
    let removedCount = 0;

    if (remoteMap.size === 0) {
        const files = await fs.promises.readdir(sourceDir);
        await Promise.all(files.map(file =>
            copyFileEnsuringDirectory(path.join(sourceDir, file), path.join(targetDir, file))
        ));
        return;
    }

    const remotePaths = new Set(remoteMap.keys());

    if (!installedManifest) {
        await fs.promises.mkdir(targetDir, { recursive: true });
        for (const relPath of remotePaths) {
            console.log(`[Install] Copying new file: ${relPath}`);
            await copyFileEnsuringDirectory(path.join(sourceDir, relPath), path.join(targetDir, relPath));
            copiedCount++;
        }
        console.log(`[Install] Selective update summary: copied=${copiedCount}, skipped=${skippedCount}, removed=${removedCount}`);
        return;
    }

    for (const [relPath, remoteHash] of remoteMap.entries()) {
        const sourcePath = path.join(sourceDir, relPath);
        const targetPath = path.join(targetDir, relPath);
        const installedHash = installedMap.get(relPath) || null;

        let currentHashForRemote = null;
        try {
            await fs.promises.access(targetPath);
            currentHashForRemote = await hashFile(targetPath, 'sha256');
        } catch {
            currentHashForRemote = null;
        }

        if (!currentHashForRemote) {
            console.log(`[Install] Copying missing file: ${relPath}`);
            await copyFileEnsuringDirectory(sourcePath, targetPath);
            copiedCount++;
            continue;
        }

        if (currentHashForRemote === remoteHash) {
            skippedCount++;
            continue;
        }

        const currentHashForInstalled = currentHashForRemote;

        if (installedHash && currentHashForInstalled === installedHash && remoteHash !== installedHash) {
            console.log(`[Install] Updating changed file: ${relPath}`);
            await copyFileEnsuringDirectory(sourcePath, targetPath);
            copiedCount++;
        } else {
            console.log(`[Install] Skipping user-modified file: ${relPath}`);
            skippedCount++;
        }
    }

    for (const [relPath, installedHash] of installedMap.entries()) {
        if (remotePaths.has(relPath)) continue;

        const targetPath = path.join(targetDir, relPath);
        let currentHash = null;
        try {
            await fs.promises.access(targetPath);
            currentHash = await hashFile(targetPath, 'sha256');
        } catch {
            currentHash = null;
        }

        if (currentHash && currentHash === installedHash) {
            console.log(`[Install] Removing obsolete file: ${relPath}`);
            await removeFileIfExists(targetPath);
            removedCount++;
        }
    }

    console.log(`[Install] Selective update summary: copied=${copiedCount}, skipped=${skippedCount}, removed=${removedCount}`);
}

async function processDownloadedModule(zipPath, meta) {
    let tempDir = null;
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

        // Extract to temp dir using streaming (handles large files without loading into memory)
        console.log('[Install] Extracting...');
        tempDir = path.join(modulesPath, `_tmp_${Date.now()}`);
        await fs.promises.mkdir(tempDir, { recursive: true });
        await extract(zipPath, { dir: tempDir });

        // Detect root folder from extracted content
        const topLevel = await fs.promises.readdir(tempDir);
        const targetModuleDir = path.join(modulesPath, meta.name);

        let sourceDir = tempDir;
        if (topLevel.length === 1) {
            const firstStat = await fs.promises.stat(path.join(tempDir, topLevel[0]));
            if (firstStat.isDirectory()) {
                sourceDir = path.join(tempDir, topLevel[0]);
            }
        }

        const remoteManifest = meta.manifest || null;
        const installedManifest = await readStoredManifest(targetModuleDir);

        if (remoteManifest && Object.keys(manifestToObject(remoteManifest)).length > 0) {
            await fs.promises.mkdir(targetModuleDir, { recursive: true });

            if (meta.cleanInstall || !installedManifest) {
                console.log('[Install] Performing full refresh from manifest...');
                await fs.promises.rm(targetModuleDir, { recursive: true, force: true });
                await fs.promises.mkdir(targetModuleDir, { recursive: true });
                await syncModuleFiles(sourceDir, targetModuleDir, remoteManifest, null);
            } else {
                console.log('[Install] Performing manifest-aware selective update...');
                await syncModuleFiles(sourceDir, targetModuleDir, remoteManifest, installedManifest);
            }
        } else {
            // Fallback for older metadata: move/merge source into target module dir.
            let targetExists = false;
            try {
                await fs.promises.access(targetModuleDir);
                targetExists = true;
            } catch { /* doesn't exist */ }

            if (targetExists) {
                const files = await fs.promises.readdir(sourceDir);
                await Promise.all(files.map(file =>
                    fs.promises.cp(
                        path.join(sourceDir, file),
                        path.join(targetModuleDir, file),
                        { recursive: true, force: true }
                    )
                ));
            } else {
                await fs.promises.rename(sourceDir, targetModuleDir);
                if (sourceDir === tempDir) tempDir = null;
            }
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

        if (remoteManifest && Object.keys(manifestToObject(remoteManifest)).length > 0) {
            try {
                await writeModuleManifest(targetModuleDir, remoteManifest, meta.version);
            } catch (err) {
                console.error('[Install] Failed to write module manifest:', err);
            }
        }

        mainWindow?.webContents.send('download-complete');
        console.log(`[Install] "${meta.name}" installed successfully.`);
    } catch (err) {
        console.error('[Install] Failed:', err);
        mainWindow?.webContents.send('download-error', err.message);
    } finally {
        setTimeout(() => safeUnlink(zipPath), 1000);
        if (tempDir) setTimeout(() => fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => { }), 1000);
    }
}
