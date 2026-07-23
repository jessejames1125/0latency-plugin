'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { runChecks } = require('../engine/preflight');

function okDeps(overrides = {}) {
  return Object.assign({
    nodeVersion: 'v22.0.0',
    resolveWs: () => true,
    loadCfg: () => ({ org: 'a', default_repo: 'a/b', notes_repo: 'a/b', deepgram_key: 'k', port: 8788 }),
    fetchFn: async () => ({ ok: true, status: 200 }),
    wssProbe: async () => true,
    exec: async (cmd) => ({ ok: true, out: `${cmd} ok` }),
    notesCloneOk: async () => true,
    portFree: async () => true,
    findBrowser: () => '/usr/bin/google-chrome',
    log: { log() {}, error() {} },
  }, overrides);
}

test('all green -> ok:true and zero failures', async () => {
  const r = await runChecks(okDeps());
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.results.filter((x) => !x.ok).length, 0);
});

test('a dead Deepgram key fails the run', async () => {
  const r = await runChecks(okDeps({ fetchFn: async () => ({ ok: false, status: 401 }) }));
  assert.strictEqual(r.ok, false);
  assert.ok(r.results.find((x) => x.name.includes('Deepgram key') && !x.ok));
});

test('blocked WSS (corporate proxy) fails with a firewall hint', async () => {
  const r = await runChecks(okDeps({ wssProbe: async () => false }));
  assert.strictEqual(r.ok, false);
  const row = r.results.find((x) => x.name.includes('WSS'));
  assert.ok(row && /proxy|firewall/i.test(row.detail));
});

test('missing browser is a warning, not a failure', async () => {
  const r = await runChecks(okDeps({ findBrowser: () => null }));
  assert.strictEqual(r.ok, true);
});
