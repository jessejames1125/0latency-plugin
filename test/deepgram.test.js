'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { buildUrl, splitBySpeaker, createStream } = require('../engine/deepgram');

test('buildUrl carries linear16/16k and toggles diarize', () => {
  const u = buildUrl({ diarize: true });
  assert.ok(u.startsWith('wss://api.deepgram.com/v1/listen?'));
  assert.ok(u.includes('encoding=linear16') && u.includes('sample_rate=16000'));
  assert.ok(u.includes('diarize=true'));
  assert.ok(!buildUrl({ diarize: false }).includes('diarize=true'));
});

test('splitBySpeaker splits an utterance on per-word speaker changes', () => {
  const alt = { transcript: 'yes I agree no', words: [
    { word: 'yes', speaker: 0 }, { word: 'I', speaker: 1 }, { word: 'agree', speaker: 1 }, { word: 'no', speaker: 0 },
  ] };
  assert.deepStrictEqual(splitBySpeaker(alt), [
    { text: 'yes', spk: 0 }, { text: 'I agree', spk: 1 }, { text: 'no', spk: 0 },
  ]);
});

test('splitBySpeaker without words falls back to one undefined-speaker part', () => {
  assert.deepStrictEqual(splitBySpeaker({ transcript: 'hello there' }), [{ text: 'hello there', spk: undefined }]);
});

class FakeWS extends EventEmitter {
  constructor() { super(); FakeWS.last = this; this.sent = []; this.readyState = 1; }
  send(d) { this.sent.push(d); }
  close() { this.emit('close'); }
}

test('a fixed-label stream tags every utterance with that label', () => {
  const got = [];
  const s = createStream({ key: 'k', diarize: false, label: 'Jesse',
    onUtterance: (u) => got.push(u), wsCtor: FakeWS, log: { log() {}, error() {} } });
  FakeWS.last.emit('message', JSON.stringify({ is_final: true, channel: { alternatives: [{ transcript: 'ship it now team', words: [] }] } }));
  assert.deepStrictEqual(got, [{ speaker: 'Jesse', text: 'ship it now team' }]);
  s.close();
});

test('a diarized stream labels speaker N from word data', () => {
  const got = [];
  const s = createStream({ key: 'k', diarize: true, label: null,
    onUtterance: (u) => got.push(u), wsCtor: FakeWS, log: { log() {}, error() {} } });
  FakeWS.last.emit('message', JSON.stringify({ is_final: true, channel: { alternatives: [{
    transcript: 'hi all', words: [{ word: 'hi', speaker: 2 }, { word: 'all', speaker: 2 }] }] } }));
  assert.deepStrictEqual(got, [{ speaker: 'speaker 2', text: 'hi all' }]);
  s.close();
});

test('close() is final: no reconnect after deliberate close', async () => {
  let ctorCount = 0;
  class CountingWS extends FakeWS { constructor() { super(); ctorCount++; } }
  const s = createStream({ key: 'k', diarize: false, label: 'x', onUtterance() {}, wsCtor: CountingWS, log: { log() {}, error() {} } });
  s.close();
  await new Promise((r) => setTimeout(r, 30));
  assert.strictEqual(ctorCount, 1);
});
