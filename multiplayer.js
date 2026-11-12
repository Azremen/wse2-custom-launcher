'use strict';

const fs = require('fs').promises;
const path = require('path');
const net = require('net');
const { lookup } = require('dns').promises;
const { constants } = require('fs');

function fail(code) {
    throw new Error(`ui.multiplayer.errors.${code}`);
}

function text(value, required = true) {
    if (typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value) || (required && !value.trim())) {
        fail('invalid_input');
    }
    return value;
}

function moduleArgs(name) {
    text(name);
    if (/[<>:"/\\|?*]/.test(name) || name.split(' ').some(word => word.startsWith('--') || /^-[mr]$/i.test(word)) || name === '.' || name === '..') fail('invalid_module');
    // WSE2's launcher passes multi-word module names without quotes.
    return ['--module', ...name.split(' ')];
}

function connectionSettings(value) {
    if (!value || typeof value !== 'object') fail('invalid_address');
    const host = text(value.host).trim();
    if (net.isIP(host) !== 4 && !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.?$/i.test(host)) {
        fail('invalid_address');
    }
    if (/^[\d.]+$/.test(host) && net.isIP(host) !== 4) fail('invalid_address');
    const portText = String(value.port ?? '');
    if (!/^\d{1,5}$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) fail('invalid_port');
    return { host, port: Number(portText) };
}

async function resolveConnection(value, resolve = lookup) {
    const settings = connectionSettings(value);
    const password = value.password === undefined ? '' : text(value.password, false);
    let address = settings.host;
    if (net.isIP(address) !== 4) {
        try {
            address = (await resolve(address, { family: 4 })).address;
        } catch {
            fail('dns');
        }
    }
    if (net.isIP(address) !== 4) fail('dns');
    return { address: `${address}:${settings.port}`, password };
}

function clientArgs(name, connection = null) {
    const args = [...moduleArgs(name), '--no-intro'];
    if (connection) {
        args.push('--address', connection.address);
        if (connection.password) args.push('--password', connection.password);
    }
    return args;
}

function extraArgs(value = '') {
    if (typeof value !== 'string') fail('invalid_input');
    const args = value.split(/\r?\n/).filter(line => line.trim());
    for (const arg of args) {
        text(arg);
        if (/^(?:--module|--config-path)(?:$|[=\s])/i.test(arg) || /^-[mr]/i.test(arg)) fail('reserved_argument');
    }
    return args;
}

async function requireFile(file, code) {
    try {
        if (!(await fs.stat(file)).isFile()) fail(code);
        await fs.access(file, constants.R_OK);
    } catch {
        fail(code);
    }
}

async function dedicatedSettings(value, moduleName) {
    if (!value || typeof value !== 'object') fail('invalid_input');
    moduleArgs(moduleName);
    const exePath = text(value.exePath).trim();
    const campaign = /^mb_warband_wse2_dedicated_campaign(?:_x64)?\.exe$/i.test(path.basename(exePath));
    const commandFile = text(value.commandFile ?? '', !campaign).trim();
    const configFile = text(value.configFile ?? '', false).trim();
    if (!path.isAbsolute(exePath) || !/^mb_warband_wse2_dedicated(?:_campaign)?(?:_x64)?\.exe$/i.test(path.basename(exePath))) {
        fail('invalid_exe');
    }
    if ((commandFile && !path.isAbsolute(commandFile)) || (configFile && !path.isAbsolute(configFile))) fail('absolute_path');
    await requireFile(exePath, 'exe_missing');
    if (commandFile) await requireFile(commandFile, 'command_missing');
    if (configFile) await requireFile(configFile, 'config_missing');
    const cwd = path.dirname(exePath);
    await requireFile(path.join(cwd, 'Modules', moduleName, 'module.ini'), 'module_missing');
    return { exePath, commandFile, configFile, cwd, args: extraArgs(value.extraArgs) };
}

function dedicatedArgs(settings, moduleName) {
    return [
        ...(settings.configFile ? ['--config-path', settings.configFile] : []),
        ...(settings.commandFile ? ['-r', settings.commandFile] : []), ...moduleArgs(moduleName), ...settings.args,
    ];
}

function quoteWindowsArgument(value) {
    if (value && !/[\s"]/.test(value)) return value;
    return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
}

function windowsConsoleArgs(settings, args) {
    const data = Buffer.from(JSON.stringify({
        exePath: settings.exePath, cwd: settings.cwd,
        arguments: args.map(quoteWindowsArgument).join(' '),
    }), 'utf8').toString('base64');
    // Only encoded data is interpolated; paths and arguments never become script.
    const script = `$ErrorActionPreference='Stop'; $launch=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${data}')) | ConvertFrom-Json; Start-Process -FilePath $launch.exePath -WorkingDirectory $launch.cwd -ArgumentList $launch.arguments -ErrorAction Stop`;
    return ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')];
}

function redact(value, password) {
    const message = String(value);
    return password ? message.replaceAll(quoteWindowsArgument(password), '[REDACTED]').replaceAll(password, '[REDACTED]') : message;
}

function savedSettings(value) {
    if (!value || typeof value !== 'object') fail('invalid_input');
    const connection = value.connection?.host ? connectionSettings(value.connection) : { host: '', port: '' };
    const dedicated = value.dedicated || {};
    return {
        connection,
        dedicated: {
            exePath: text(dedicated.exePath ?? '', false),
            commandFile: text(dedicated.commandFile ?? '', false),
            configFile: text(dedicated.configFile ?? '', false),
        },
    };
}

module.exports = {
    clientArgs, connectionSettings, resolveConnection, dedicatedSettings,
    dedicatedArgs, extraArgs, quoteWindowsArgument, redact, savedSettings,
    windowsConsoleArgs,
};
