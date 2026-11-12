'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const ini = require('ini');
const schema = require('../config.json');
const { editorData, serializeConfig } = require('../server-config');

test('server editor uses shared controls, masks passwords and preserves unknown settings', () => {
    const raw = '\uFEFFrootSetting=keep\n[DedicatedServer]\nbLogChat=false\n[Network]\niServerPort=7350\nsRCONServerPassword=example-only\n[Campaign Settings]\nfTickRate=0.125\ncustomValue=keep\nentries[]=one\nentries[]=two\n';
    const data = editorData(schema, raw);
    assert.equal(data.values.DedicatedServer.bLogChat, false);
    assert.equal(data.values.Network.iServerPort, 7350);
    assert.equal(data.schema.Network.sRCONServerPassword.inputType, 'password');
    assert.equal(data.schema.Network.sRCONServerPassword['default-value'], '');
    assert.equal(data.values['Campaign Settings'].fTickRate, 0.125);
    assert.equal(data.schema.Graphics, undefined);
    data.values.Network.iServerPort = 7450;
    data.values.DedicatedServer.bLogChat = true;
    const saved = ini.parse(serializeConfig(raw, data.schema, data.values));
    assert.equal(saved.Network.iServerPort, '7450');
    assert.equal(saved.DedicatedServer.bLogChat, true);
    assert.equal(saved.Network.sRCONServerPassword, 'example-only');
    assert.equal(saved.rootSetting, 'keep');
    assert.equal(saved['Campaign Settings'].customValue, 'keep');
    assert.deepEqual(saved['Campaign Settings'].entries, ['one', 'two']);
});

test('new server configuration serializes defaults and rejects invalid or incomplete data', () => {
    const data = editorData(schema, '');
    const saved = ini.parse(serializeConfig('', data.schema, data.values));
    assert.equal(saved.Threads.bThreadedPhysics, false);
    assert.equal(saved.Network.sRCONServerPassword, '');
    for (const invalid of [NaN, Infinity, -1, 1.5, '7240']) {
        const values = structuredClone(data.values);
        values.Network.iServerPort = invalid;
        assert.throws(() => serializeConfig('', data.schema, values), /config_values/);
    }
    const values = structuredClone(data.values);
    values.Network.sServerAddress = '127.0.0.1\n[Other]';
    assert.throws(() => serializeConfig('', data.schema, values), /config_values/);
    delete values.Network;
    assert.throws(() => serializeConfig('', data.schema, values), /config_values/);
});
