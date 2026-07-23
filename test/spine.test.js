'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { appendEvent, readEvents } = require('../engine/spine');

test('appendEvent writes one JSON line with a timestamp; readEvents round-trips', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '0l-'));
  const p = path.join(dir, 'events.jsonl');
  appendEvent(p, { type: 'utterance', speaker: 'Operator', text: 'hello' });
  appendEvent(p, { type: 'frame', path: 'frames/0001.png' });
  const evs = readEvents(p);
  assert.strictEqual(evs.length, 2);
  assert.strictEqual(evs[0].type, 'utterance');
  assert.ok(evs[0].t, 'event carries a timestamp');
  assert.strictEqual(evs[1].path, 'frames/0001.png');
});

test('readEvents on a missing file returns []', () => {
  assert.deepStrictEqual(readEvents(path.join(os.tmpdir(), 'nope-0l', 'x.jsonl')), []);
});
