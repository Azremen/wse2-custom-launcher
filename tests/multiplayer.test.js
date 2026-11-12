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
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
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

function mainHarness(root, platform, spawnError = false) {
    const handlers = new Map();
    const launches = [];
    const messages = [];
    const logger = { transports: { file: {}, console: {} } };
    for (const level of ['info', 'warn', 'error']) logger[level] = (...args) => messages.push(args.join(' '));
    const childProcess = {
        spawn(command, args, options) {
            const child = new EventEmitter();
            child.stdout = new PassThrough();
            child.stderr = new PassThrough();
            child.unref = () => { child.unreferenced = true; };
            launches.push({ command, args, options, child });
            process.nextTick(() => child.emit(spawnError ? 'error' : 'spawn', spawnError ? new Error('spawn failed') : undefined));
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
        app: { isPackaged: false, getPath: () => root, on() { }, whenReady: () => ({ then() { } }) },
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
            if (name === 'electron-updater') return { autoUpdater: {} };
            if (name === 'child_process') return childProcess;
            if (name === './multiplayer') return multiplayer;
            if (name === './server-config') return require('../server-config');
            if (name === 'fs') return { ...fs, writeFileSync() { } };
            return require(name);
        },
        __dirname: root,
        process: { ...process, platform, env: { ...process.env, PATH: root }, on() { } },
        console: {}, Buffer, URL, TextDecoder,
        setTimeout() { return 1; }, clearTimeout() { },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8'), context);
    context.findGameInstallPath = async () => root;
    context.loadWineSettings = async () => ({ winePath: path.join(root, 'wine'), winePrefix: path.join(root, 'prefix') });
    return { handlers, launches, messages, context, dialogs };
}

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
