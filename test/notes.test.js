'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { commitFrame, pad4 } = require('../engine/notes');

function mkFrame() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '0l-frame-'));
  const src = path.join(dir, 'src.png');
  fs.writeFileSync(src, Buffer.from('PNGDATA'));
  const notesDir = fs.mkdtempSync(path.join(os.tmpdir(), '0l-notes-'));
  return { src, notesDir };
}

// A fake git runner recording (cwd,args) and reporting success; a rev-parse yields a SHA.
function gitRecorder(pushOk = true) {
  const calls = [];
  const run = async (cwd, args) => {
    calls.push(args.join(' '));
    if (args[0] === 'rev-parse') return { ok: true, out: 'deadbeef123' };
    if (args[0] === 'push') return { ok: pushOk };
    return { ok: true, out: '' };
  };
  run.calls = calls;
  return run;
}

test('commitFrame copies the PNG into the notes tree, commits, pushes, returns a SHA-pinned raw URL', async () => {
  const { src, notesDir } = mkFrame();
  const run = gitRecorder(true);
  const r = await commitFrame({ notesDir, meetingId: '2026-07-23-demo', notesRepo: 'acme/notes', frameAbsPath: src, seq: 3 }, run);
  assert.strictEqual(r.committed, true);
  assert.strictEqual(r.rel, 'docs/meetings/2026-07-23-demo/frames/0003.png');
  assert.strictEqual(r.rawUrl, 'https://github.com/acme/notes/raw/deadbeef123/docs/meetings/2026-07-23-demo/frames/0003.png');
  assert.ok(fs.existsSync(path.join(notesDir, r.rel)), 'frame was copied into the notes clone');
  assert.ok(run.calls.some((c) => c.startsWith('add ')) && run.calls.some((c) => c.startsWith('commit ')), 'staged and committed');
});

test('commitFrame falls back to the meetings branch when the default push is rejected', async () => {
  const { src, notesDir } = mkFrame();
  const run = gitRecorder(false); // default push fails
  const r = await commitFrame({ notesDir, meetingId: 'm', notesRepo: 'acme/notes', frameAbsPath: src, seq: 1 }, run);
  assert.ok(run.calls.includes('push origin HEAD:0latency/meetings'), 'attempted the fallback branch push');
  // With the injected runner reporting the fallback push not ok either, committed reflects that honestly.
  assert.strictEqual(r.committed, false);
});

test('commitFrame reports committed:false (never throws) when the source frame is missing', async () => {
  const { notesDir } = mkFrame();
  const r = await commitFrame({ notesDir, meetingId: 'm', notesRepo: 'acme/notes', frameAbsPath: '/does/not/exist.png', seq: 1 }, gitRecorder(true));
  assert.strictEqual(r.committed, false);
  assert.ok(/copy failed/.test(r.error));
});

test('pad4 zero-pads', () => { assert.strictEqual(pad4(7), '0007'); });
