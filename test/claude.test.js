'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { buildArgs, parseClaudeOutput, runClaude, stripFences, EVENT_TOOLS } = require('../engine/claude');

test('buildArgs NEVER contains --dangerously-skip-permissions (hard project constraint)', () => {
  const args = buildArgs({ model: 'sonnet', allowedTools: EVENT_TOOLS });
  assert.ok(!args.includes('--dangerously-skip-permissions'));
  assert.ok(!args.some((a) => /dangerously/.test(a)));
});

test('buildArgs carries -p, json output, model, and every allowed tool', () => {
  const args = buildArgs({ model: 'sonnet', allowedTools: ['Read', 'Bash(gh issue create:*)'] });
  assert.ok(args.includes('-p'));
  assert.ok(args.includes('--output-format') && args.includes('json'));
  assert.ok(args.includes('--model') && args.includes('sonnet'));
  const i = args.indexOf('--allowedTools');
  assert.ok(i >= 0);
  assert.ok(args.includes('Bash(gh issue create:*)'));
});

test('parseClaudeOutput reads the LAST result envelope past hook noise', () => {
  const out = 'SessionStart hook says hi\n{"other":1}\n{"result":"the answer","is_error":false}';
  assert.strictEqual(parseClaudeOutput(out), 'the answer');
});

test('parseClaudeOutput throws on error envelopes and on no envelope', () => {
  assert.throws(() => parseClaudeOutput('{"result":"boom","is_error":true}'), /boom/);
  assert.throws(() => parseClaudeOutput('plain text only'), /envelope/);
});

test('stripFences unwraps ```json fences', () => {
  assert.strictEqual(stripFences('```json\n[1,2]\n```'), '[1,2]');
});

test('runClaude resolves via an injected fake spawn', async () => {
  const { EventEmitter } = require('node:events');
  function fakeSpawn() {
    const c = new EventEmitter();
    c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
    c.stdin = { write() {}, end() {} };
    setImmediate(() => { c.stdout.emit('data', '{"result":"[]","is_error":false}'); c.emit('close', 0); });
    return c;
  }
  const res = await runClaude({ prompt: 'x', model: 'sonnet', allowedTools: ['Read'], spawnFn: fakeSpawn });
  assert.strictEqual(res, '[]');
});
