'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createFiring, buildEventPrompt } = require('../engine/firing');
const { createCaps } = require('../engine/caps');
const { readEvents } = require('../engine/spine');

const TEMPLATE = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'event-session.md'), 'utf8');
const CFG = { creation: 'auto', execution: 'off', models: { events: 'sonnet' }, caps: { events: 20 },
  org: 'acme', default_repo: 'acme/app', notes_repo: 'acme/app', repos: [{ name: 'acme/app', hint: 'the app' }] };

function mkSession() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '0l-fire-'));
  fs.mkdirSync(path.join(dir, 'state'), { recursive: true });
  return dir;
}
const utt = (text, t) => ({ speaker: 'speaker 1', text, t: new Date(t).toISOString() });

test('buildEventPrompt substitutes every placeholder', () => {
  const p = buildEventPrompt({ template: TEMPLATE, meetingId: '2026-07-23-demo', meetingTitle: 'Demo',
    batch: [utt('let us fix the export button today', Date.now())], frames: [], config: CFG, notesDir: '/n', startT: Date.now() - 65000 });
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(p), `unsubstituted placeholder in prompt`);
  assert.ok(p.includes('let us fix the export button today'));
  assert.ok(p.includes('acme/app'));
});

test('auto mode: tick() spawns one session per non-empty batch and records action_taken', async () => {
  const dir = mkSession();
  const prompts = [];
  const f = createFiring({ sessionDir: dir, config: CFG, caps: createCaps(path.join(dir, 'state'), { events: 20 }, { log() {}, error() {} }),
    runSession: async (p) => { prompts.push(p); return JSON.stringify([{ title: 'Fix export button', repo: 'acme/app', url: 'https://github.com/acme/app/issues/7', frame: null }]); },
    template: TEMPLATE, meetingId: 'm1', meetingTitle: 'Demo', startT: Date.now(), log: { log() {}, error() {} } });
  f.onUtterance(utt('this is small talk today ok', Date.now()));
  f.onUtterance(utt('let us fix the broken export button on invoices', Date.now()));
  await f.tick();
  assert.strictEqual(prompts.length, 1, 'one session for the batch');
  const taken = readEvents(path.join(dir, 'events.jsonl')).filter((e) => e.type === 'action_taken');
  assert.strictEqual(taken.length, 1);
  assert.strictEqual(taken[0].url, 'https://github.com/acme/app/issues/7');
  await f.tick();
  assert.strictEqual(prompts.length, 1, 'empty batch spawns nothing');
});

test('review mode: candidates drain to queue.md, no session spawns', async () => {
  const dir = mkSession();
  let spawned = 0;
  const f = createFiring({ sessionDir: dir, config: Object.assign({}, CFG, { creation: 'review' }),
    caps: createCaps(path.join(dir, 'state'), { events: 20 }, { log() {}, error() {} }),
    runSession: async () => { spawned++; return '[]'; },
    template: TEMPLATE, meetingId: 'm1', meetingTitle: 'Demo', startT: Date.now(), log: { log() {}, error() {} } });
  f.onUtterance(utt('let us remove the legacy banner from checkout', Date.now()));
  await f.tick();
  assert.strictEqual(spawned, 0);
  const q = fs.readFileSync(path.join(dir, 'queue.md'), 'utf8');
  assert.ok(q.includes('legacy banner'));
  assert.ok(q.includes('- [ ]'));
});

test('a session that throws or returns junk is logged and dropped, never crashes', async () => {
  const dir = mkSession();
  const f = createFiring({ sessionDir: dir, config: CFG, caps: createCaps(path.join(dir, 'state'), { events: 20 }, { log() {}, error() {} }),
    runSession: async () => 'NOT JSON AT ALL',
    template: TEMPLATE, meetingId: 'm1', meetingTitle: 'Demo', startT: Date.now(), log: { log() {}, error() {} } });
  f.onUtterance(utt('let us drop the old admin route entirely', Date.now()));
  await f.tick(); // must not throw
  assert.strictEqual(readEvents(path.join(dir, 'events.jsonl')).filter((e) => e.type === 'action_taken').length, 0);
});

test('caps: when events budget is exhausted, tick() drains candidates without spawning', async () => {
  const dir = mkSession();
  let spawned = 0;
  const caps = createCaps(path.join(dir, 'state'), { events: 1 }, { log() {}, error() {} });
  caps.take('events'); // exhaust
  const f = createFiring({ sessionDir: dir, config: CFG, caps,
    runSession: async () => { spawned++; return '[]'; },
    template: TEMPLATE, meetingId: 'm1', meetingTitle: 'Demo', startT: Date.now(), log: { log() {}, error() {} } });
  f.onUtterance(utt('let us fix the login redirect loop now', Date.now()));
  await f.tick();
  assert.strictEqual(spawned, 0);
});
