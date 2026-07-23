'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCaps } = require('../engine/caps');

function mkLog() { const lines = []; return { lines, log: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push(a.join(' ')) }; }

test('take() allows up to budget, then refuses; warns once at 80% and once at cap', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '0l-caps-'));
  const logger = mkLog();
  const caps = createCaps(dir, { events: 5 }, logger);
  for (let i = 0; i < 5; i++) assert.ok(caps.take('events'), `call ${i + 1} allowed`);
  assert.ok(!caps.take('events'), 'over budget refused');
  assert.ok(!caps.take('events'), 'still refused');
  const warns = logger.lines.filter((l) => l.includes('80%')).length;
  const capMsgs = logger.lines.filter((l) => l.includes('CAP')).length;
  assert.strictEqual(warns, 1, 'exactly one 80% warning');
  assert.strictEqual(capMsgs, 1, 'exactly one cap message');
});

test('counters persist across instances (engine restart mid-meeting)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '0l-caps-'));
  const a = createCaps(dir, { events: 3 }, mkLog());
  a.take('events'); a.take('events');
  const b = createCaps(dir, { events: 3 }, mkLog());
  assert.strictEqual(b.used('events'), 2);
  assert.ok(b.take('events'));
  assert.ok(!b.take('events'));
});
