'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startCaptureServer } = require('../engine/capture-server');
const { readEvents } = require('../engine/spine');

// 1x1 transparent PNG
const PNG64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function mkSession() { return fs.mkdtempSync(path.join(os.tmpdir(), '0l-cap-')); }

test('serves the sensor page, accepts tagged audio, routes control, writes frames', async () => {
  const dir = mkSession();
  const audio = [], control = [];
  const srv = await startCaptureServer(dir, {
    port: 0, // ephemeral for tests
    onAudio: (tag, buf) => audio.push([tag, buf.length]),
    onControl: (m) => control.push(m),
  });
  // page
  const page = await fetch(srv.url);
  assert.ok((await page.text()).includes('TAG_MIC'));
  // ws: tagged binary + json control
  const WebSocket = require('ws');
  const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
  await new Promise((r) => ws.on('open', r));
  ws.send(Buffer.concat([Buffer.from([1]), Buffer.alloc(320)]));
  ws.send(Buffer.concat([Buffer.from([2]), Buffer.alloc(640)]));
  ws.send(JSON.stringify({ type: 'capture_start', source: 'screen' }));
  await new Promise((r) => setTimeout(r, 100));
  assert.deepStrictEqual(audio, [[1, 320], [2, 640]]);
  assert.strictEqual(control[0].type, 'capture_start');
  // frame POST
  const res = await fetch(`${srv.url}frame`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ raw: `data:image/png;base64,${PNG64}`, trigger: 'change' }) });
  assert.strictEqual(res.status, 200);
  assert.ok(fs.existsSync(path.join(dir, 'frames', '0001.png')));
  const evs = readEvents(path.join(dir, 'events.jsonl'));
  assert.strictEqual(evs.filter((e) => e.type === 'frame').length, 1);
  ws.close();
  await srv.stop();
});

test('a second server on an already-listening fixed port rejects readably instead of crashing (EADDRINUSE, log-and-continue)', async () => {
  const dir1 = mkSession();
  const dir2 = mkSession();
  const srv1 = await startCaptureServer(dir1, { port: 0, onAudio: () => {}, onControl: () => {} });
  await assert.rejects(
    startCaptureServer(dir2, { port: srv1.port, onAudio: () => {}, onControl: () => {} }),
    /failed to start on port/,
  );
  await srv1.stop();
});
