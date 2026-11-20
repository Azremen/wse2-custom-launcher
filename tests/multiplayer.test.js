'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const multiplayer = require('../multiplayer');

test('direct connect resolves IPv4 hostnames and validates address, port and password', async () => {
    const connection = await multiplayer.resolveConnection({ host: 'game.example.org', port: '7240', password: 'a "quoted" password\\' },
        async (host, options) => {
            assert.equal(host, 'game.example.org');
            assert.equal(options.family, 4);
            return { address: '127.0.0.1' };
        });
    assert.deepEqual(multiplayer.clientArgs('Native Expansion', connection),
        ['--module', 'Native', 'Expansion', '--no-intro', '--address', '127.0.0.1:7240', '--password', 'a "quoted" password\\']);
    assert.deepEqual(multiplayer.clientArgs('Native Expansion'), ['--module', 'Native', 'Expansion', '--no-intro']);
    assert.deepEqual(multiplayer.clientArgs('- My Mod -'), ['--module', '-', 'My', 'Mod', '-', '--no-intro']);
    for (const host of ['https://example.org', '127.0.0.1:7240', '::1', '999.999.999.999', '-bad.host']) {
        assert.throws(() => multiplayer.connectionSettings({ host, port: 7240 }), /invalid_address/);
    }
    for (const port of ['', 0, 65536, 1.5, '1e3', ' 7240']) {
        assert.throws(() => multiplayer.connectionSettings({ host: 'localhost', port }), /invalid_port/);
    }
    for (const port of [1, 65535]) {
        assert.equal((await multiplayer.resolveConnection({ host: '127.0.0.1', port })).address, `127.0.0.1:${port}`);
    }
    await assert.rejects(multiplayer.resolveConnection({ host: 'localhost', port: 7240 }, async () => { throw new Error('DNS'); }), /errors.dns/);
    await assert.rejects(multiplayer.resolveConnection({ host: '127.0.0.1', port: 7240, password: 'a\nb' }), /invalid_input/);
    await assert.rejects(multiplayer.resolveConnection({ host: '127.0.0.1', port: 7240, campaign: 'false' }), /invalid_input/);
});

test('campaign direct connect adds its switch only when selected', async () => {
    for (const campaign of [true, false]) {
        const connection = await multiplayer.resolveConnection({ host: '127.0.0.1', port: 7240, password: 'example', campaign });
        const args = multiplayer.clientArgs('NativeCoop', connection);
        assert.deepEqual(args, [
            '--module', 'NativeCoop', '--no-intro', '--address', '127.0.0.1:7240', '--password', 'example',
            ...(campaign ? ['--campaign'] : []),
        ]);
    }
});

test('dedicated arguments preserve one argument per line and reject overrides and module traversal', () => {
    assert.deepEqual(multiplayer.extraArgs('--verbose\r\n\r\nvalue with spaces\n'), ['--verbose', 'value with spaces']);
    for (const arg of ['-r', '-RNative.txt', '-m Native', '--module=Other', '--config-path Other.ini']) {
        assert.throws(() => multiplayer.extraArgs(arg), /reserved_argument/);
    }
    for (const mod of ['..', '../Other', 'Native --module Other', 'bad"name', '']) {
        assert.throws(() => multiplayer.clientArgs(mod), /invalid_(module|input)/);
    }
    assert.throws(() => multiplayer.extraArgs('bad\0arg'), /invalid_input/);
});

test('saved settings exclude passwords and extra arguments; Windows logging masks quoted secrets', () => {
    const password = 'a "quoted" secret\\';
    const saved = multiplayer.savedSettings({
        password, connection: { host: 'localhost', port: 7240, password },
        dedicated: { exePath: 'server.exe', commandFile: 'Native.txt', configFile: '', extraArgs: password },
    });
    assert.equal(JSON.stringify(saved).includes(password), false);
    assert.equal(Object.hasOwn(saved.connection, 'password'), false);
    assert.equal(Object.hasOwn(saved.dedicated, 'extraArgs'), false);
    const quoted = multiplayer.quoteWindowsArgument(password);
    assert.equal(quoted, '"a \\"quoted\\" secret\\\\"');
    assert.equal(multiplayer.redact(`--password ${quoted}`, password), '--password [REDACTED]');
    assert.equal(multiplayer.redact(password, password), '[REDACTED]');
});

async function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wse2-multiplayer-'));
    t.after(() => fs.promises.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
    fs.mkdirSync(path.join(root, 'Modules', 'Native Expansion'), { recursive: true });
    for (const file of ['mb_warband_wse2_dedicated.exe', 'mb_warband_wse2_dedicated_x64.exe',
        'mb_warband_wse2_dedicated_campaign.exe', 'mb_warband_wse2_dedicated_campaign_x64.exe', 'mb_warband_wse2.exe',
        'mb_warband_wse2_x64.exe', 'server commands.txt', 'server config.ini', path.join('Modules', 'Native Expansion', 'module.ini')]) {
        fs.writeFileSync(path.join(root, file), '');
    }
    return {
        root,
        settings: {
            exePath: path.join(root, 'mb_warband_wse2_dedicated_x64.exe'),
            commandFile: path.join(root, 'server commands.txt'),
            configFile: path.join(root, 'server config.ini'),
            extraArgs: '--verbose\nvalue with spaces',
        },
    };
}

test('dedicated validation requires the executable, command file, optional config and installed module', async t => {
    const { root, settings } = await fixture(t);
    const validated = await multiplayer.dedicatedSettings(settings, 'Native Expansion');
    assert.equal(validated.cwd, root);
    assert.deepEqual(multiplayer.dedicatedArgs(validated, 'Native Expansion'),
        ['--config-path', settings.configFile, '-r', settings.commandFile, '--module', 'Native', 'Expansion', '--verbose', 'value with spaces']);
    const optional = await multiplayer.dedicatedSettings({ ...settings, configFile: '' }, 'Native Expansion');
    assert.equal(multiplayer.dedicatedArgs(optional, 'Native Expansion')[0], '-r');
    for (const [field, expected] of [['exePath', 'invalid_exe'], ['commandFile', 'command_missing'], ['configFile', 'config_missing']]) {
        await assert.rejects(multiplayer.dedicatedSettings({ ...settings, [field]: path.join(root, 'missing') }, 'Native Expansion'), new RegExp(expected));
    }
    await assert.rejects(multiplayer.dedicatedSettings(settings, 'Missing'), /module_missing/);
    await assert.rejects(multiplayer.dedicatedSettings({ ...settings, commandFile: 'relative.txt' }, 'Native Expansion'), /absolute_path/);
    fs.unlinkSync(settings.exePath);
    await assert.rejects(multiplayer.dedicatedSettings(settings, 'Native Expansion'), /exe_missing/);
});

function mainHarness(root, platform, spawnError = false, env = {}) {
    const handlers = new Map();
    const launches = [];
    const messages = [];
    const autoUpdater = new EventEmitter();
    autoUpdater.checkForUpdates = async () => ({});
    const logger = { transports: { file: {}, console: {} } };
    for (const level of ['info', 'warn', 'error']) logger[level] = (...args) => messages.push(args.join(' '));
    const childProcess = {
        spawn(command, args, options) {
            const child = new EventEmitter();
            child.stdout = new PassThrough();
            child.stderr = new PassThrough();
            child.unref = () => { child.unreferenced = true; };
            launches.push({ command, args, options, child });
            process.nextTick(() => {
                if (spawnError === true) return child.emit('error', new Error('spawn failed'));
                child.emit('spawn');
                if (args.includes('-EncodedCommand') && options.stdio?.[1] === 'pipe') {
                    if (spawnError === 'early exit') child.emit('close', 1);
                    else child.stdout.write('ready\r\n');
                }
            });
            return child;
        },
        execFile(command, args, options, callback) {
            callback(null, `Z:${args[1].replace(/\\/g, '/')}\n`, '');
        },
    };
    childProcess.execFile[require('node:util').promisify.custom] = async (command, args, options) => {
        launches.push({ command, args, options });
        if (spawnError) throw new Error('spawn failed');
        return { stdout: `Z:${args[1].replace(/\\/g, '/')}\n`, stderr: '' };
    };
    const electron = {
        app: {
            isPackaged: false, getPath: () => root, getVersion: () => '1.0.0',
            quit() { this.quitCalled = true; },
            on() { }, whenReady: () => ({ then() { } }),
        },
        ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
        dialog: {
            showOpenDialog: async () => dialogs.open,
            showSaveDialog: async () => dialogs.save,
        },
    };
    const dialogs = { open: { canceled: true }, save: { canceled: true } };
    const context = vm.createContext({
        require(name) {
            if (name === 'electron') return electron;
            if (name === 'electron-log') return logger;
            if (name === 'electron-updater') return { autoUpdater };
            if (name === 'child_process') return childProcess;
            if (name === './multiplayer') return multiplayer;
            if (name === './server-config') return require('../server-config');
            if (name === 'fs') return { ...fs, writeFileSync() { } };
            return require(name);
        },
        __dirname: root,
        process: { ...process, platform, env: { ...process.env, PATH: root, ...env }, on() { } },
        console: {}, Buffer, URL, TextDecoder, performance,
        setTimeout() { return 1; }, clearTimeout() { },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8'), context);
    context.findGameInstallPath = async () => root;
    context.loadWineSettings = async () => ({ winePath: path.join(root, 'wine'), winePrefix: path.join(root, 'prefix') });
    return { handlers, launches, messages, context, dialogs, app: electron.app, autoUpdater };
}

test('installed launcher updates report speed and ETA, including unknown size and stalled transfers', async t => {
    const { root } = await fixture(t);
    const { context, autoUpdater } = mainHarness(root, 'win32', false, { PORTABLE_EXECUTABLE_DIR: '' });
    const events = [];
    context.testWindow = { webContents: { send: (channel, progress) => events.push({ channel, ...progress }) } };
    vm.runInContext('mainWindow = testWindow', context);
    context.setupAutoUpdater();
    autoUpdater.emit('download-progress', { percent: 25.5, bytesPerSecond: 400, transferred: 255, total: 1000 });
    assert.deepEqual(events.pop(), { channel: 'update_download_progress', percent: 25.5, bytesPerSecond: 400, remainingSeconds: 2 });
    autoUpdater.emit('download-progress', { bytesPerSecond: 400, transferred: 255, total: 0 });
    assert.deepEqual(events.pop(), { channel: 'update_download_progress', percent: null, bytesPerSecond: 400, remainingSeconds: null });
    autoUpdater.emit('download-progress', { percent: 50, bytesPerSecond: 0, transferred: 500, total: 1000 });
    assert.equal(events.pop().remainingSeconds, null);
});

test('portable updates report speed with or without a size and reset metrics on the next download', async t => {
    const { root } = await fixture(t);
    const { context, handlers } = mainHarness(root, 'win32', false, {
        PORTABLE_EXECUTABLE_DIR: root,
        PORTABLE_EXECUTABLE_FILE: path.join(root, 'portable.exe'),
    });
    let time = 0;
    context.performance = { now: () => time };
    const events = [];
    context.testWindow = { webContents: { send: (channel, progress) => {
        if (channel === 'update_download_progress') events.push({ ...progress });
    } } };
    vm.runInContext('mainWindow = testWindow', context);
    for (const knownSize of [true, false]) {
        events.length = 0;
        context.fetch = async url => url.includes('/releases/latest') ? {
            ok: true, json: async () => ({
                tag_name: 'v1.0.1',
                assets: [{ name: 'wse2-launcher-Windows-Portable.exe', browser_download_url: 'https://example.invalid/portable.exe' }],
            }),
        } : {
            ok: true, headers: { get: () => knownSize ? '8' : null },
            body: (async function* () {
                for (let i = 0; i < 2; i++) {
                    time += 500;
                    yield Buffer.from('MZok');
                }
            })(),
        };
        assert.equal(await handlers.get('start_update')(), true);
        assert.deepEqual(events[0], { percent: knownSize ? 0 : null, bytesPerSecond: null, remainingSeconds: null });
        assert.deepEqual(events[1], { percent: knownSize ? 50 : null, bytesPerSecond: 8, remainingSeconds: knownSize ? 1 : null });
        assert.deepEqual(events.at(-1), { percent: 100, bytesPerSecond: null, remainingSeconds: null });
    }
});

test('module and launcher download UI share localized speed and ETA and clear stale estimates', () => {
    const elements = new Map();
    const $ = selector => {
        if (!elements.has(selector)) {
            elements.set(selector, {
                length: 1, attrs: {}, styles: {}, value: '',
                ready() {},
                attr(name, value) { this.attrs[name] = value; return this; },
                removeAttr(name) { delete this.attrs[name]; return this; },
                css(name, value) { this.styles[name] = value; return this; },
                text(value) { this.value = value; return this; },
                addClass() { return this; }, removeClass() { return this; },
            });
        }
        return elements.get(selector);
    };
    const context = vm.createContext({ $, document: {}, localStorage: { getItem: () => null }, Intl });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8'), context);
    for (const locale of ['en', 'tr', 'ru']) {
        context.testTranslations = require(`../locales/${locale}.json`);
        context.testLocale = locale;
        vm.runInContext('translations = testTranslations; currentLocale = testLocale', context);
        const progress = { percent: 50, bytesPerSecond: 2 * 1024 ** 2, remainingSeconds: 12 };
        context.updateLauncherProgress(progress);
        context.updateProgressBar(progress);
        const status = $('#updater-download-status').value;
        assert.match(status, /2 MiB\/s/);
        assert.ok(status.includes(context.t('ui.download_eta_seconds', { seconds: 12 })));
        assert.equal($('#download-status').value, status);
        context.updateLauncherProgress({ percent: null, bytesPerSecond: 512, remainingSeconds: null });
        assert.match($('#updater-download-status').value, /0[.,]5 KiB\/s/);
        assert.ok($('#updater-download-status').value.includes(context.t('ui.download_eta_unknown')));
        assert.equal($('#updater-progress-bar').attrs['aria-valuenow'], undefined);
        context.updateLauncherProgress({ percent: 100, bytesPerSecond: null, remainingSeconds: null });
        assert.equal($('#updater-download-status').value, context.t('ui.done'));
        context.updateLauncherProgress();
        assert.ok($('#updater-download-status').value.includes(context.t('ui.download_estimating')));
        assert.equal($('#updater-progress-bar').styles.width, '0%');
    }
});

test('portable update quits only after the helper is ready, preserving completed downloads on helper failures', async t => {
    const { root } = await fixture(t);
    const portablePath = path.join(root, "Launcher's portable.exe");
    for (const scenario of ['success', 'spawn failure', 'early exit', 'incomplete']) {
        const spawnError = scenario === 'early exit' ? scenario : scenario === 'spawn failure';
        const { handlers, context, launches, app, messages } = mainHarness(root, 'win32', spawnError, {
            PORTABLE_EXECUTABLE_DIR: root,
            PORTABLE_EXECUTABLE_FILE: portablePath,
        });
        context.fetch = async url => url.includes('/releases/latest') ? {
            ok: true, json: async () => ({
                tag_name: 'v1.0.1',
                assets: [{ name: 'wse2-launcher-Windows-Portable.exe', browser_download_url: 'https://example.invalid/portable.exe' }],
            }),
        } : {
            ok: true, headers: { get: () => '4' },
            body: (async function* () { yield Buffer.from(scenario === 'incomplete' ? 'bad' : 'MZok'); })(),
        };
        assert.equal(await handlers.get('start_update')(), scenario === 'success', scenario);
        assert.equal(!!app.quitCalled, scenario === 'success', scenario);
        if (scenario === 'success') {
            assert.equal(launches[0].child.unreferenced, true);
            assert.equal(launches[0].options.cwd, root);
        } else {
            assert.ok(messages.some(message => message.includes('Portable update failed')));
        }
        if (scenario === 'incomplete') assert.equal(fs.existsSync(`${portablePath}.update`), false);
        else {
            assert.equal(fs.readFileSync(`${portablePath}.update`, 'utf8'), 'MZok');
            fs.unlinkSync(`${portablePath}.update`);
        }
    }
});

test('portable updater waits for a locked EXE, replaces it and starts the new executable', {
    skip: process.platform !== 'win32',
    timeout: 30000,
}, async t => {
    const { execFileSync, spawn } = require('node:child_process');
    const { root } = await fixture(t);
    const dir = path.join(root, "Portable's Türkçe folder");
    fs.mkdirSync(dir);
    const portablePath = path.join(dir, 'launcher.exe');
    const updatePath = `${portablePath}.update`;
    const sourcePath = path.join(root, 'portable-stub.cs');
    const readyPath = `${portablePath}.ready`;
    const startedPath = `${portablePath}.started`;
    fs.writeFileSync(sourcePath, `
using System;
using System.IO;
using System.Reflection;
using System.Threading;
class Stub {
    static void Main(string[] args) {
        string exe = Assembly.GetExecutingAssembly().Location;
        if (args.Length > 0) {
            File.WriteAllText(exe + ".ready", "ready");
            Thread.Sleep(2000);
        } else {
            File.WriteAllText(exe + ".started", "started");
        }
    }
}`);
    const compiler = path.join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
    execFileSync(compiler, ['/nologo', '/target:winexe', `/out:${portablePath}`, sourcePath], { windowsHide: true });
    const replacement = Buffer.concat([fs.readFileSync(portablePath), Buffer.from('new version')]);
    fs.writeFileSync(updatePath, replacement);
    const old = spawn(portablePath, ['hold'], { stdio: 'ignore' });
    const exited = new Promise((resolve, reject) => {
        old.once('error', reject);
        old.once('exit', resolve);
    });
    t.after(async () => { if (old.exitCode === null) old.kill(); await exited; });
    const waitFor = async file => {
        const deadline = Date.now() + 5000;
        while (!fs.existsSync(file)) {
            if (Date.now() > deadline) assert.fail(`Timed out waiting for ${file}`);
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    };
    await waitFor(readyPath);
    const context = vm.createContext({ Buffer, path, process, spawn, setTimeout, clearTimeout, createInterface: require('node:readline').createInterface });
    const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    vm.runInContext(mainSource.slice(mainSource.indexOf('function portableUpdaterScript('), mainSource.indexOf('async function downloadPortableUpdate(')), context);
    // The Electron parent is already gone, but the portable wrapper still locks the EXE.
    await context.startPortableUpdater(portablePath, updatePath, 2147483647);
    await waitFor(startedPath);
    assert.deepEqual(fs.readFileSync(portablePath), replacement);
    assert.equal(fs.existsSync(updatePath), false);
});

test('download progress estimates bytes per second and rounds remaining time up', async t => {
    const { root } = await fixture(t);
    const { context } = mainHarness(root, 'win32');
    let time = 0;
    const measure = context.createDownloadMeter(0, () => time);
    assert.deepEqual({ ...measure(0, 1000) }, { percent: 0, bytesPerSecond: null, remainingSeconds: null });
    time = 499;
    assert.equal(measure(200, 1000).bytesPerSecond, null);
    time = 500;
    assert.deepEqual({ ...measure(200, 1000) }, { percent: 20, bytesPerSecond: 400, remainingSeconds: 2 });
    time = 1000;
    assert.deepEqual({ ...measure(800, 1000) }, { percent: 80, bytesPerSecond: 1200, remainingSeconds: 1 });
    time = 1500;
    assert.deepEqual({ ...measure(800, 1000) }, { percent: 80, bytesPerSecond: 0, remainingSeconds: null });
});

test('download progress shows speed without a size and drops a stale estimate when bytes reset', async t => {
    const { root } = await fixture(t);
    const { context } = mainHarness(root, 'win32');
    let time = 0;
    const measure = context.createDownloadMeter(1000, () => time);
    time = 500;
    assert.deepEqual({ ...measure(2000, 0) }, { percent: null, bytesPerSecond: 2000, remainingSeconds: null });
    time = 600;
    assert.deepEqual({ ...measure(0, 2000) }, { percent: 0, bytesPerSecond: null, remainingSeconds: null });
    time = 1100;
    const progress = measure(2000, 2000);
    assert.ok(progress.percent < 100);
    assert.equal(progress.bytesPerSecond, 4000);
});

test('Workshop launches use the exact Steam title and suffix, not the display or INI name', async t => {
    const { root } = await fixture(t);
    const { handlers, context, launches } = mainHarness(root, 'win32');
    const modulePath = path.join(root, 'steamapps', 'workshop', 'content', '48700', '42');
    fs.mkdirSync(modulePath, { recursive: true });
    fs.writeFileSync(path.join(modulePath, 'module.ini'), 'module_name = Native');
    const title = 'Native_Expansion Reforged!';
    const steamItems = [{ publishedFileId: 42n, title }];
    context.getSteamClient = () => ({
        workshop: {
            getSubscribedItems: () => [42n],
            state: () => 4,
            installInfo: () => ({ folder: modulePath }),
            getItems: async () => ({ items: steamItems }),
        },
    });
    const [item] = await context.scanWorkshopItemsViaSteam();
    const mod = await context.createWorkshopModule(item);
    const localPath = path.join(root, 'Modules', title);
    fs.mkdirSync(localPath, { recursive: true });
    fs.writeFileSync(path.join(localPath, 'module.ini'), '');
    assert.equal(await handlers.get('launch-game')(null, title, localPath, false), true);
    assert.deepEqual(Array.from(launches.at(-1).args), ['--module', 'Native_Expansion', 'Reforged!', '--no-intro']);

    const expected = ['--module', 'Native_Expansion', 'Reforged!', '(Steam', 'Workshop)', '--no-intro'];
    assert.equal(await handlers.get('launch-game')(null, mod.launchName, mod.path, false), true);
    assert.deepEqual(Array.from(launches.at(-1).args), expected);
    const connect = handlers.get('connect-game');
    assert.equal((await connect(null, mod.launchName, mod.path, true, { host: '127.0.0.1', port: 7240 })).success, true);
    assert.deepEqual(Array.from(launches.at(-1).args), [...expected, '--address', '127.0.0.1:7240']);

    steamItems.length = 0;
    const [fallbackItem] = await context.scanWorkshopItemsViaSteam();
    const fallback = await context.createWorkshopModule(fallbackItem);
    assert.equal((await connect(null, fallback.launchName, fallback.path, false, { host: '127.0.0.1', port: 7240 })).error,
        'ui.multiplayer.errors.workshop_title');
    assert.equal(await handlers.get('launch-game')(null, fallback.launchName, fallback.path, false), false);
    assert.equal(launches.length, 3);
});

test('Windows IPC launches client x86/x64 and an encoded server console, persists no password', async t => {
    const { root, settings } = await fixture(t);
    const { handlers, launches, messages } = mainHarness(root, 'win32');
    assert.equal(await handlers.get('launch-game')(null, 'Native Expansion', null, false), true);
    assert.deepEqual(Array.from(launches.at(-1).args), ['--module', 'Native', 'Expansion', '--no-intro']);
    for (const x64 of [false, true]) {
        const result = await handlers.get('connect-game')(null, 'Native Expansion', null, x64, { host: '127.0.0.1', port: 7240, password: 'top "secret"' });
        assert.equal(result.success, true);
        const last = launches.at(-1);
        assert.equal(path.basename(last.command), x64 ? 'mb_warband_wse2_x64.exe' : 'mb_warband_wse2.exe');
        assert.equal(last.args.at(-1), '"top \\"secret\\""');
        last.child.stderr.write('top "sec');
        last.child.stderr.write('ret"\n');
        assert.equal(messages.join('\n').includes('top "secret"'), false);
        assert.equal(last.args.includes('--campaign'), false);
        assert.equal((await handlers.get('connect-game')(null, 'Native Expansion', null, x64, { host: '127.0.0.1', port: 7240, campaign: true })).success, true);
        assert.deepEqual(Array.from(launches.at(-1).args), ['--module', 'Native', 'Expansion', '--no-intro', '--address', '127.0.0.1:7240', '--campaign']);
    }
    const result = await handlers.get('launch-dedicated')(null, 'Native Expansion', settings);
    assert.equal(result.success, true);
    const server = launches.at(-1);
    assert.equal(path.basename(server.command), 'powershell.exe');
    assert.equal(server.args.includes('-EncodedCommand'), true);
    const script = Buffer.from(server.args.at(-1), 'base64').toString('utf16le');
    const payload = JSON.parse(Buffer.from(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/.exec(script)[1], 'base64').toString('utf8'));
    assert.equal(payload.exePath, settings.exePath);
    assert.equal(payload.arguments.includes(multiplayer.quoteWindowsArgument(settings.commandFile)), true);
    assert.equal(script.includes(settings.exePath), false);
    assert.equal(server.options.windowsHide, true);
    assert.equal(server.options.timeout, 15000);
    assert.equal(server.options.cwd, root);
    await handlers.get('save-multiplayer-settings')(null, { connection: { host: 'localhost', port: 7240, password: 'SECRET' }, dedicated: settings });
    const persisted = fs.readFileSync(path.join(root, 'multiplayer-settings.json'), 'utf8');
    assert.equal(persisted.includes('SECRET'), false);
    assert.equal(persisted.includes('extraArgs'), false);
    assert.equal((await handlers.get('get-multiplayer-settings')()).settings.connection.port, 7240);
    assert.equal((await handlers.get('save-multiplayer-settings')(null, { connection: { host: 'bad:host', port: 7240 } })).error,
        'ui.multiplayer.errors.invalid_address');
});

test('spawn errors are failures rather than success-shaped results', async t => {
    const { root, settings } = await fixture(t);
    const { handlers } = mainHarness(root, 'win32', true);
    assert.equal((await handlers.get('launch-dedicated')(null, 'Native Expansion', settings)).success, false);
    assert.equal((await handlers.get('connect-game')(null, 'Native Expansion', null, false, { host: '127.0.0.1', port: 7240 })).success, false);
});

test('Linux uses Wine prefix, Windows file paths and a detached terminal; missing tools fail explicitly', async t => {
    const { root, settings } = await fixture(t);
    for (const name of ['wine', 'wineconsole', 'winepath', 'xterm']) fs.writeFileSync(path.join(root, name), '', { mode: 0o755 });
    const { handlers, launches } = mainHarness(root, 'linux');
    assert.equal((await handlers.get('launch-dedicated')(null, 'Native Expansion', settings)).success, true);
    const server = launches.at(-1);
    assert.equal(path.basename(server.command), 'xterm');
    assert.deepEqual(Array.from(server.args.slice(0, 4)), ['-e', path.join(root, 'wineconsole'), '--backend=curses', settings.exePath]);
    assert.equal(server.args.includes(`Z:${settings.commandFile.replace(/\\/g, '/')}`), true);
    assert.equal(server.options.env.WINEPREFIX, path.join(root, 'prefix'));
    assert.equal(server.options.stdio, 'ignore');
    for (const x64 of [false, true]) {
        assert.equal((await handlers.get('connect-game')(null, 'Native Expansion', null, x64, { host: '127.0.0.1', port: 7240 })).success, true);
        const client = launches.at(-1);
        assert.equal(client.command, path.join(root, 'wine'));
        assert.equal(path.basename(client.args[0]), x64 ? 'mb_warband_wse2_x64.exe' : 'mb_warband_wse2.exe');
        assert.deepEqual(Array.from(client.args.slice(1)), ['--module', 'Native', 'Expansion', '--no-intro', '--address', '127.0.0.1:7240']);
        assert.equal(client.options.env.WINEPREFIX, path.join(root, 'prefix'));
        assert.equal((await handlers.get('connect-game')(null, 'Native Expansion', null, x64, { host: '127.0.0.1', port: 7240, campaign: true })).success, true);
        assert.deepEqual(Array.from(launches.at(-1).args.slice(1)), ['--module', 'Native', 'Expansion', '--no-intro', '--address', '127.0.0.1:7240', '--campaign']);
    }
    fs.unlinkSync(path.join(root, 'xterm'));
    assert.equal((await handlers.get('launch-dedicated')(null, 'Native Expansion', settings)).error, 'ui.multiplayer.errors.terminal');
    fs.unlinkSync(path.join(root, 'wineconsole'));
    assert.equal((await handlers.get('launch-dedicated')(null, 'Native Expansion', settings)).error, 'ui.multiplayer.errors.wine_tools');
});

test('campaign x86/x64 launches without -r and still accepts a chosen command file', async t => {
    const { root, settings } = await fixture(t);
    const { handlers, launches } = mainHarness(root, 'win32');
    for (const suffix of ['', '_x64']) {
        const campaign = {
            ...settings,
            exePath: path.join(root, `mb_warband_wse2_dedicated_campaign${suffix}.exe`),
            commandFile: '',
            extraArgs: '--example\nvalue with spaces',
        };
        assert.equal((await handlers.get('launch-dedicated')(null, 'Native Expansion', campaign)).success, true);
        const script = Buffer.from(launches.at(-1).args.at(-1), 'base64').toString('utf16le');
        const payload = JSON.parse(Buffer.from(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/.exec(script)[1], 'base64').toString('utf8'));
        assert.equal(payload.exePath, campaign.exePath);
        assert.equal(payload.arguments.includes('-r '), false);
        assert.equal(payload.arguments.includes('--module Native Expansion'), true);
        const validated = await multiplayer.dedicatedSettings({ ...campaign, commandFile: settings.commandFile }, 'Native Expansion');
        assert.equal(multiplayer.dedicatedArgs(validated, 'Native Expansion').includes('-r'), true);
    }
    await assert.rejects(multiplayer.dedicatedSettings({ ...settings, commandFile: '' }, 'Native Expansion'), /invalid_input/);
});

test('argument TXT import supports UTF-8 BOM/CRLF, cancellation and explicit invalid-file errors', async t => {
    const { root } = await fixture(t);
    const { handlers, dialogs } = mainHarness(root, 'win32');
    const file = path.join(root, 'launch args.txt');
    dialogs.open = { canceled: false, filePaths: [file] };
    fs.writeFileSync(file, '\uFEFF--example\r\nvalue with spaces\r\n\r\n');
    assert.equal((await handlers.get('import-server-arguments')()).args, '--example\nvalue with spaces');
    fs.writeFileSync(file, '--module\nOther');
    assert.equal((await handlers.get('import-server-arguments')()).error, 'ui.multiplayer.errors.reserved_argument');
    fs.writeFileSync(file, Buffer.from([0xff, 0xfe, 0x00]));
    assert.equal((await handlers.get('import-server-arguments')()).error, 'ui.multiplayer.errors.arguments_file');
    dialogs.open = { canceled: true };
    assert.equal((await handlers.get('import-server-arguments')()).args, null);
});

test('server INI IPC saves only the bound file, supports Save As and leaves module configuration unchanged', async t => {
    const { root, settings } = await fixture(t);
    fs.copyFileSync(path.join(__dirname, '..', 'config.json'), path.join(root, 'config.json'));
    const { handlers, context, dialogs } = mainHarness(root, 'win32');
    const configWindow = new EventEmitter();
    configWindow.webContents = {};
    context.testConfigWindow = configWindow;
    context.createConfigWindow = () => {
        vm.runInContext('cfgWindow = testConfigWindow', context);
    };
    const target = path.join(root, 'server config.ini');
    const other = path.join(root, 'server copy.ini');
    fs.writeFileSync(target, '[Network]\niServerPort=7340\n[Custom]\nvalue=keep\n');
    const opening = handlers.get('open-server-config')({}, target, settings.exePath);
    const data = await handlers.get('get-config-data')({ sender: configWindow.webContents });
    assert.equal(data.mode, 'server');
    data.values.Network.iServerPort = 7440;
    const denied = await handlers.get('save-config-data')({ sender: {} }, { modulePath: other, configData: data.values });
    assert.equal(denied.success, false);
    const result = await handlers.get('save-config-data')({ sender: configWindow.webContents }, { modulePath: other, configData: data.values });
    assert.equal(result.success, true);
    assert.equal(fs.existsSync(other), false);
    assert.equal(require('ini').parse(fs.readFileSync(target, 'utf8')).Custom.value, 'keep');
    dialogs.save = { canceled: false, filePath: other };
    assert.equal((await handlers.get('save-config-data')({ sender: configWindow.webContents },
        { configData: data.values, saveAs: true })).success, true);
    configWindow.emit('closed');
    assert.equal((await opening).path, other);
    vm.runInContext('currentServerConfig = null; cfgWindow = null', context);
    const modulePath = path.join(root, 'Modules', 'Native Expansion');
    const client = await handlers.get('get-config-data')({}, modulePath);
    assert.equal(client.modulePath, modulePath);
    assert.equal(client.mode, undefined);
    assert.equal(fs.existsSync(path.join(modulePath, 'module_config_template.ini')), false);
});

test('new server INI requires a Save As destination and cancellation writes nothing', async t => {
    const { root, settings } = await fixture(t);
    fs.copyFileSync(path.join(__dirname, '..', 'config.json'), path.join(root, 'config.json'));
    const { handlers, context, dialogs } = mainHarness(root, 'win32');
    const configWindow = new EventEmitter();
    configWindow.webContents = {};
    context.testConfigWindow = configWindow;
    context.createConfigWindow = () => vm.runInContext('cfgWindow = testConfigWindow', context);
    const opening = handlers.get('open-server-config')({}, '', settings.exePath);
    const data = await handlers.get('get-config-data')({ sender: configWindow.webContents });
    assert.equal(data.isNew, true);
    const canceled = await handlers.get('save-config-data')({ sender: configWindow.webContents }, { configData: data.values });
    assert.equal(canceled.canceled, true);
    const filePath = path.join(root, 'new server.ini');
    assert.equal(fs.existsSync(filePath), false);
    dialogs.save = { canceled: false, filePath };
    assert.equal((await handlers.get('save-config-data')({ sender: configWindow.webContents }, { configData: data.values })).success, true);
    assert.equal(fs.existsSync(filePath), true);
    configWindow.emit('closed');
    assert.equal((await opening).path, filePath);
});
