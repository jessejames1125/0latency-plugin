'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadConfig, DEFAULTS } = require('../engine/config');

function tmpConfig(obj) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '0l-cfg-'));
  const p = path.join(dir, 'config.json');
  fs.writeFileSync(p, JSON.stringify(obj));
  return p;
}

test('loadConfig merges defaults over a minimal valid file', () => {
  const p = tmpConfig({ org: 'acme', default_repo: 'acme/app', notes_repo: 'acme/app' });
  const cfg = loadConfig(p);
  assert.strictEqual(cfg.creation, 'auto');
  assert.strictEqual(cfg.execution, 'off');
  assert.strictEqual(cfg.caps.events, 20);
  assert.strictEqual(cfg.port, 8788);
  assert.strictEqual(cfg.org, 'acme');
});

test('loadConfig throws listing ALL missing required fields', () => {
  const p = tmpConfig({ org: 'acme' });
  assert.throws(() => loadConfig(p), (e) => /default_repo/.test(e.message) && /notes_repo/.test(e.message));
});

test('env DEEPGRAM_API_KEY wins over file key', () => {
  const p = tmpConfig({ org: 'a', default_repo: 'a/b', notes_repo: 'a/b', deepgram_key: 'file-key' });
  process.env.DEEPGRAM_API_KEY = 'env-key';
  try { assert.strictEqual(loadConfig(p).deepgram_key, 'env-key'); }
  finally { delete process.env.DEEPGRAM_API_KEY; }
});

test('a missing file throws a readable error, not ENOENT spew', () => {
  assert.throws(() => loadConfig(path.join(os.tmpdir(), 'no-0l', 'config.json')), /0l:setup/);
});

test('DEFAULTS is exported and deep-frozen enough not to leak between loads', () => {
  const p1 = tmpConfig({ org: 'a', default_repo: 'a/b', notes_repo: 'a/b' });
  const c1 = loadConfig(p1); c1.caps.events = 999;
  const c2 = loadConfig(p1);
  assert.strictEqual(c2.caps.events, DEFAULTS.caps.events);
});
