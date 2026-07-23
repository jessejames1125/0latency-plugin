'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createFiring, buildEventPrompt, buildBody, extractFindings } = require('../engine/firing');
const { createCaps } = require('../engine/caps');
const { readEvents } = require('../engine/spine');

const TEMPLATE = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'event-session.md'), 'utf8');
const CFG = { creation: 'auto', execution: 'off', models: { events: 'sonnet' }, caps: { events: 20 },
  org: 'acme', default_repo: 'acme/app', notes_repo: 'acme/notes', repos: [{ name: 'acme/app', hint: 'the app' }, { name: 'acme/api', hint: 'backend api' }] };

function mkSession() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '0l-fire-'));
  fs.mkdirSync(path.join(dir, 'state'), { recursive: true });
  return dir;
}
const utt = (text, t) => ({ speaker: 'speaker 1', text, t: new Date(t).toISOString() });
const noLog = { log() {}, error() {} };

// Injected deterministic runners — no network, no git. Record what the engine asked for.
function fakeGh(calls = {}) {
  calls.created = calls.created || [];
  calls.labels = calls.labels || [];
  return {
    open: calls.open || null,
    ensureLabels: async (repo, labels) => { calls.labels.push({ repo, labels }); },
    findOpenIssue: async (repo, title) => (calls.open && calls.open.title === title ? calls.open.number : null),
    createIssue: async ({ repo, title, body, labels }) => { calls.created.push({ repo, title, body, labels }); return { url: `https://github.com/${repo}/issues/7`, number: '7' }; },
  };
}
function fakeNotes(calls = {}) {
  calls.frames = calls.frames || [];
  return {
    commitFrame: async ({ meetingId, notesRepo, frameAbsPath, seq }) => {
      calls.frames.push({ frameAbsPath, seq });
      const rel = `docs/meetings/${meetingId}/frames/${String(seq).padStart(4, '0')}.png`;
      return { committed: true, sha: 'abc1234', rel, rawUrl: `https://github.com/${notesRepo}/raw/abc1234/${rel}` };
    },
  };
}

test('buildEventPrompt substitutes every placeholder and lists the roster', () => {
  const p = buildEventPrompt({ template: TEMPLATE, meetingId: '2026-07-23-demo', meetingTitle: 'Demo',
    batch: [utt('let us fix the export button today', Date.now())], config: CFG, startT: Date.now() - 65000 });
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(p), 'no unsubstituted placeholder');
  assert.ok(p.includes('let us fix the export button today'));
  assert.ok(p.includes('acme/app') && p.includes('acme/api'));
  assert.ok(/NO tools/i.test(p), 'prompt states the session has no tools');
});

test('auto mode: engine (not the model) files a finding via the injected gh runner', async () => {
  const dir = mkSession();
  const gh = fakeGh(), ghCalls = { created: [] };
  const g = fakeGh(ghCalls);
  const f = createFiring({ sessionDir: dir, config: CFG, caps: createCaps(path.join(dir, 'state'), { events: 20 }, noLog),
    runSession: async () => JSON.stringify([{ title: 'Fix export button', repo: 'acme/app', confidence: 'high', evidence: 'let us fix the broken export button on invoices', evidence_elapsed: '00:00:00', body: 'The export button 500s.' }]),
    gh: g, notes: fakeNotes(), template: TEMPLATE, meetingId: 'm1', meetingTitle: 'Demo', startT: Date.now(), log: noLog });
  f.onUtterance(utt('let us fix the broken export button on invoices', Date.now()));
  await f.tick();
  assert.strictEqual(ghCalls.created.length, 1, 'engine called gh.createIssue exactly once');
  assert.strictEqual(ghCalls.created[0].repo, 'acme/app');
  const taken = readEvents(path.join(dir, 'events.jsonl')).filter((e) => e.type === 'action_taken');
  assert.strictEqual(taken.length, 1);
  assert.strictEqual(taken[0].url, 'https://github.com/acme/app/issues/7');
});

test('routing: a finding for a repo NOT in the roster falls back to default_repo + route-unsure label', async () => {
  const dir = mkSession();
  const ghCalls = { created: [] };
  const f = createFiring({ sessionDir: dir, config: CFG, caps: createCaps(path.join(dir, 'state'), { events: 20 }, noLog),
    runSession: async () => JSON.stringify([{ title: 'Fix infra thing', repo: 'acme/terraform-not-in-roster', confidence: 'high', evidence: 'fix the infra thing now please', evidence_elapsed: '00:00:00', body: 'x' }]),
    gh: fakeGh(ghCalls), notes: fakeNotes(), template: TEMPLATE, meetingId: 'm1', meetingTitle: 'Demo', startT: Date.now(), log: noLog });
  f.onUtterance(utt('fix the infra thing now please', Date.now()));
  await f.tick();
  assert.strictEqual(ghCalls.created[0].repo, 'acme/app', 'unknown repo → default_repo');
  assert.ok(ghCalls.created[0].labels.includes('0l:route-unsure'), 'marked route-unsure');
});

test('grounding: a finding near a frame commits the frame and the body carries the SHA-pinned URL + fetch snippet', async () => {
  const dir = mkSession();
  const startT = Date.now();
  const notesCalls = { frames: [] }, ghCalls = { created: [] };
  const f = createFiring({ sessionDir: dir, config: CFG, caps: createCaps(path.join(dir, 'state'), { events: 20 }, noLog),
    runSession: async () => JSON.stringify([{ title: 'Fix crop', repo: 'acme/app', confidence: 'high', evidence: 'fix the avatar crop here it looks stretched', evidence_elapsed: '00:00:15', body: 'x' }]),
    gh: fakeGh(ghCalls), notes: fakeNotes(notesCalls), template: TEMPLATE, meetingId: 'm1', meetingTitle: 'Demo', startT, log: noLog });
  f.onFrame({ t: new Date(startT + 10000).toISOString(), path: '/abs/frames/0003.png' }); // 00:00:10, before the finding
  f.onUtterance(utt('fix the avatar crop here it looks stretched', startT + 15000));
  await f.tick();
  assert.strictEqual(notesCalls.frames.length, 1, 'engine committed the correlated frame');
  assert.strictEqual(notesCalls.frames[0].seq, 3, 'seq parsed from the frame filename');
  const body = ghCalls.created[0].body;
  assert.ok(body.includes('raw/abc1234'), 'body has the SHA-pinned raw image URL');
  assert.ok(body.includes('gh api') && body.includes('vnd.github.raw'), 'body has the agent fetch snippet');
});

test('dedupe: an already-open issue with the same title is skipped, no create', async () => {
  const dir = mkSession();
  const ghCalls = { created: [], open: { title: 'Fix export button', number: '42' } };
  const f = createFiring({ sessionDir: dir, config: CFG, caps: createCaps(path.join(dir, 'state'), { events: 20 }, noLog),
    runSession: async () => JSON.stringify([{ title: 'Fix export button', repo: 'acme/app', confidence: 'high', evidence: 'e', evidence_elapsed: '00:00:00', body: 'x' }]),
    gh: fakeGh(ghCalls), notes: fakeNotes(), template: TEMPLATE, meetingId: 'm1', meetingTitle: 'Demo', startT: Date.now(), log: noLog });
  f.onUtterance(utt('fix the export button please now', Date.now()));
  await f.tick();
  assert.strictEqual(ghCalls.created.length, 0, 'no duplicate created');
});

test('review mode: candidates drain to queue.md, no session spawns', async () => {
  const dir = mkSession();
  let spawned = 0;
  const f = createFiring({ sessionDir: dir, config: Object.assign({}, CFG, { creation: 'review' }),
    caps: createCaps(path.join(dir, 'state'), { events: 20 }, noLog),
    runSession: async () => { spawned++; return '[]'; }, gh: fakeGh(), notes: fakeNotes(),
    template: TEMPLATE, meetingId: 'm1', meetingTitle: 'Demo', startT: Date.now(), log: noLog });
  f.onUtterance(utt('let us remove the legacy banner from checkout', Date.now()));
  await f.tick();
  assert.strictEqual(spawned, 0);
  const q = fs.readFileSync(path.join(dir, 'queue.md'), 'utf8');
  assert.ok(q.includes('legacy banner') && q.includes('- [ ]'));
});

test('a session that returns junk is logged and dropped, never crashes, files nothing', async () => {
  const dir = mkSession();
  const ghCalls = { created: [] };
  const f = createFiring({ sessionDir: dir, config: CFG, caps: createCaps(path.join(dir, 'state'), { events: 20 }, noLog),
    runSession: async () => 'NOT JSON AT ALL', gh: fakeGh(ghCalls), notes: fakeNotes(),
    template: TEMPLATE, meetingId: 'm1', meetingTitle: 'Demo', startT: Date.now(), log: noLog });
  f.onUtterance(utt('let us drop the old admin route entirely', Date.now()));
  await f.tick();
  assert.strictEqual(ghCalls.created.length, 0);
  assert.strictEqual(readEvents(path.join(dir, 'events.jsonl')).filter((e) => e.type === 'action_taken').length, 0);
});

test('overlapping tick() calls never spawn a second concurrent session (in-flight guard)', async () => {
  const dir = mkSession();
  let spawned = 0, resolveSession;
  const gate = new Promise((r) => { resolveSession = r; });
  const f = createFiring({ sessionDir: dir, config: CFG, caps: createCaps(path.join(dir, 'state'), { events: 20 }, noLog),
    runSession: async () => { spawned++; await gate; return JSON.stringify([{ title: 'Fix export', repo: 'acme/app', confidence: 'high', evidence: 'e', evidence_elapsed: '00:00:00', body: 'x' }]); },
    gh: fakeGh(), notes: fakeNotes(), template: TEMPLATE, meetingId: 'm1', meetingTitle: 'Demo', startT: Date.now(), log: noLog });
  f.onUtterance(utt('let us fix the broken export button on invoices', Date.now()));
  const firstTick = f.tick();
  f.onUtterance(utt('let us also fix the broken import button on invoices', Date.now()));
  await f.tick();
  assert.strictEqual(spawned, 1, 'a slow first tick blocks a concurrent second spawn');
  resolveSession();
  await firstTick;
  await f.tick();
  assert.strictEqual(spawned, 2, 'the still-pending candidate spawns only after the first tick finished');
});

test('caps: when events budget is exhausted, tick() drains candidates without spawning', async () => {
  const dir = mkSession();
  let spawned = 0;
  const caps = createCaps(path.join(dir, 'state'), { events: 1 }, noLog);
  caps.take('events');
  const f = createFiring({ sessionDir: dir, config: CFG, caps,
    runSession: async () => { spawned++; return '[]'; }, gh: fakeGh(), notes: fakeNotes(),
    template: TEMPLATE, meetingId: 'm1', meetingTitle: 'Demo', startT: Date.now(), log: noLog });
  f.onUtterance(utt('let us fix the login redirect loop now', Date.now()));
  await f.tick();
  assert.strictEqual(spawned, 0);
});

test('extractFindings survives a SessionStart-hook greeting prepended to the result', () => {
  // A `claude -p` inheriting an operator hook can emit "[JARVIS BOOT] ...\n\n[{...}]".
  const wrapped = '[JARVIS BOOT] Thursday. Ready, Jesse.\n\n```json\n[{"title":"Fix X","repo":"acme/app"}]\n```';
  const a = extractFindings(wrapped);
  assert.strictEqual(a.length, 1);
  assert.strictEqual(a[0].title, 'Fix X');
  assert.deepStrictEqual(extractFindings('no json here at all'), []);
  assert.deepStrictEqual(extractFindings('[]'), []);
});

test('auto mode still files when the reply is greeting-wrapped (engine tolerates hook noise)', async () => {
  const dir = mkSession();
  const ghCalls = { created: [] };
  const f = createFiring({ sessionDir: dir, config: CFG, caps: createCaps(path.join(dir, 'state'), { events: 20 }, noLog),
    runSession: async () => '[JARVIS BOOT] Ready, Jesse.\n[{"title":"Fix export","repo":"acme/app","confidence":"high","evidence":"e","evidence_elapsed":"00:00:00","body":"x"}]',
    gh: fakeGh(ghCalls), notes: fakeNotes(), template: TEMPLATE, meetingId: 'm1', meetingTitle: 'Demo', startT: Date.now(), log: noLog });
  f.onUtterance(utt('let us fix the broken export button now', Date.now()));
  await f.tick();
  assert.strictEqual(ghCalls.created.length, 1, 'greeting-wrapped reply still yields a filed issue');
});

test('buildBody without a frame omits the Evidence/Frame sections', () => {
  const body = buildBody({ finding: { title: 'T', evidence: 'e', evidence_elapsed: '00:01:00', body: 'b' }, speaker: 'Dana', framed: null, notesRepo: 'acme/notes', meetingTitle: 'Demo' });
  assert.ok(body.includes('## Finding') && body.includes('Dana'));
  assert.ok(!body.includes('## Evidence'));
  assert.ok(body.includes('## Ground rules'));
});
