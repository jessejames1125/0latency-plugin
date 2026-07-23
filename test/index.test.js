'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { shouldAutoStop, buildRelaunchArgs, heartbeatLine } = require('../engine/index');

const CFG = { idle_stop_min: 20, max_meeting_h: 3 };
const T0 = Date.parse('2026-07-23T10:00:00Z');
const min = (n) => n * 60000;

test('shouldAutoStop: null while active', () => {
  assert.strictEqual(shouldAutoStop({ now: T0 + min(30), startT: T0, lastUtteranceT: T0 + min(29), captureStartedT: T0, cfg: CFG }), null);
});
test('shouldAutoStop: idle after idle_stop_min of silence', () => {
  assert.strictEqual(shouldAutoStop({ now: T0 + min(50), startT: T0, lastUtteranceT: T0 + min(29), captureStartedT: T0, cfg: CFG }), 'idle');
});
test('shouldAutoStop: never idle before capture started (setup fiddling is not silence)', () => {
  assert.strictEqual(shouldAutoStop({ now: T0 + min(50), startT: T0, lastUtteranceT: null, captureStartedT: null, cfg: CFG }), null);
});
test('shouldAutoStop: max wall clock wins', () => {
  assert.strictEqual(shouldAutoStop({ now: T0 + min(181), startT: T0, lastUtteranceT: T0 + min(180), captureStartedT: T0, cfg: CFG }), 'max');
});
test('buildRelaunchArgs strips only --detach', () => {
  assert.deepStrictEqual(buildRelaunchArgs(['start', '--title', 'Demo', '--detach']), ['start', '--title', 'Demo']);
});
test('heartbeatLine shows elapsed, rate, and issues', () => {
  const line = heartbeatLine({ now: T0 + min(42) + 13000, startT: T0, uttCount: 100, windowUtt: 9, issues: 3 });
  assert.ok(line.includes('00:42:13'));
  assert.ok(line.includes('9 utt/min'));
  assert.ok(line.includes('3 issues'));
});
