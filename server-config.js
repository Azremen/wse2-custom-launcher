'use strict';

const ini = require('ini');

const SERVER_FIELDS = {
    DedicatedServer: null,
    General: ['bSuppressPerformanceWarnings', 'bSuppressScriptErrors', 'bSuppressWarnings', 'iMaxFrameRate', 'sCoreResources', 'sStoragePath'],
    Log: null,
    Network: null,
    Physics: ['bRagdollSoak', 'bRagdollSoakApplyForce'],
    Profiling: null,
};

function inferredField(key, value) {
    const field = { name: key, type: 'text', 'default-value': value, inputType: /password/i.test(key) ? 'password' : 'text' };
    if (typeof value === 'boolean') {
        field.type = 'checkbox';
    } else if (/^[if][A-Z]/.test(key) && String(value).trim() && Number.isFinite(Number(value))) {
        field.type = 'number';
        field['default-value'] = Number(value);
        field.step = key.startsWith('f') ? 0.000001 : 1;
    }
    return field;
}

function editorData(appSchema, raw) {
    const saved = ini.parse(raw.replace(/^\uFEFF/, ''));
    const schema = {};
    for (const [section, keys] of Object.entries(SERVER_FIELDS)) {
        if (!appSchema[section]) continue;
        schema[section] = Object.fromEntries(Object.entries(appSchema[section])
            .filter(([key]) => !keys || keys.includes(key)));
    }
    schema.Threads = { bThreadedPhysics: inferredField('bThreadedPhysics', false) };
    for (const [section, entries] of Object.entries(saved)) {
        if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
        if (!Object.hasOwn(schema, section)) Object.defineProperty(schema, section, { value: {}, enumerable: true });
        for (const [key, value] of Object.entries(entries)) {
            if (value !== null && typeof value === 'object') continue;
            const field = Object.hasOwn(appSchema, section) && Object.hasOwn(appSchema[section], key)
                ? appSchema[section][key] : inferredField(key, value);
            Object.defineProperty(schema[section], key, { value: field, enumerable: true, configurable: true, writable: true });
        }
    }
    const values = {};
    for (const [section, fields] of Object.entries(schema)) {
        Object.defineProperty(values, section, { value: {}, enumerable: true });
        for (const [key, field] of Object.entries(fields)) {
            const definition = { ...field };
            if (definition.type === 'checkbox' && typeof definition['default-value'] === 'string') {
                definition.type = 'text';
                definition.inputType = 'text';
            }
            if (/password/i.test(key)) {
                definition.inputType = 'password';
                definition['default-value'] = '';
            }
            schema[section][key] = definition;
            let value = saved[section]?.[key] ?? definition['default-value'];
            if ((definition.type === 'number' || typeof definition['default-value'] === 'number') && String(value).trim() && Number.isFinite(Number(value))) {
                value = Number(value);
            }
            Object.defineProperty(values[section], key, { value, enumerable: true, writable: true });
        }
    }
    return { schema, values };
}

function serializeConfig(raw, schema, values) {
    const result = ini.parse(raw.replace(/^\uFEFF/, ''));
    if (!values || typeof values !== 'object') throw new Error('ui.multiplayer.errors.config_values');
    for (const [section, fields] of Object.entries(schema)) {
        if (!Object.hasOwn(values, section) || !values[section] || typeof values[section] !== 'object') {
            throw new Error('ui.multiplayer.errors.config_values');
        }
        if (!Object.hasOwn(result, section)) Object.defineProperty(result, section, { value: {}, enumerable: true });
        for (const [key, field] of Object.entries(fields)) {
            if (!Object.hasOwn(values[section], key)) throw new Error('ui.multiplayer.errors.config_values');
            const value = values[section][key];
            const numeric = field.type === 'number' || typeof field['default-value'] === 'number';
            const valid = numeric
                ? typeof value === 'number' && Number.isFinite(value)
                    && (field.step !== 1 || Number.isInteger(value))
                    && (field.min === undefined || value >= field.min) && (field.max === undefined || value <= field.max)
                : field.type === 'checkbox' || typeof field['default-value'] === 'boolean'
                    ? typeof value === 'boolean'
                    : typeof value === 'string' && !/[\x00\r\n]/.test(value);
            if (!valid) throw new Error('ui.multiplayer.errors.config_values');
            Object.defineProperty(result[section], key, { value, enumerable: true, configurable: true });
        }
    }
    return ini.stringify(result);
}

module.exports = { editorData, serializeConfig };
