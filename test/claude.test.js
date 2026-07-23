'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { buildArgs, parseClaudeOutput, runClaude, stripFences, DENY_TOOLS } = require('../engine/claude');

test('buildArgs NEVER contains --dangerously-skip-permissions (hard project constraint)', () => {
  const args = buildArgs({ model: 'sonnet', disallowedTools: DENY_TOOLS });
  assert.ok(!args.includes('--dangerously-skip-permissions'));
  assert.ok(!args.some((a) => /dangerously/.test(a)));
});

test('buildArgs carries -p, json output, model, and disables every side-effect tool', () => {
  const args = buildArgs({ model: 'sonnet', disallowedTools: DENY_TOOLS });
  assert.ok(args.includes('-p'));
  assert.ok(args.includes('--output-format') && args.includes('json'));
  assert.ok(args.includes('--model') && args.includes('sonnet'));
  assert.ok(args.includes('--disallowedTools'), 'must pass --disallowedTools (the only flag proven to turn tools OFF)');
  // The tools an injected transcript could weaponise are all denied.
  for (const t of ['Bash', 'Read', 'Write', 'Edit', 'WebFetch']) assert.ok(args.includes(t), `${t} must be disallowed`);
  // And crucially the session is NOT granted any tools.
  assert.ok(!args.includes('--allowedTools'), 'a data-only session grants no tools');
  // Isolation from the operator's ambient environment (any machine, any person's hooks/MCP).
  assert.ok(args.includes('--strict-mcp-config'), 'no operator MCP servers reach the session');
  const si = args.indexOf('--setting-sources');
  assert.ok(si >= 0 && args[si + 1] === 'project', 'user/local settings (hooks, output styles, allow-rules) are not inherited');
});

test('DENY_TOOLS covers the read/write/execute/network built-ins', () => {
  for (const t of ['Bash', 'Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task']) {
    assert.ok(DENY_TOOLS.includes(t), `${t} must be in DENY_TOOLS`);
  }
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

function fakeSpawnFactory(capture) {
  const { EventEmitter } = require('node:events');
  return function fakeSpawn(cmd, args, options) {
    if (capture) { capture.args = args; capture.options = options; }
    const c = new EventEmitter();
    c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
    c.stdin = { write() {}, end() {} };
    setImmediate(() => { c.stdout.emit('data', '{"result":"[]","is_error":false}'); c.emit('close', 0); });
    return c;
  };
}

test('runClaude resolves via an injected fake spawn', async () => {
  const res = await runClaude({ prompt: 'x', model: 'sonnet', disallowedTools: DENY_TOOLS, spawnFn: fakeSpawnFactory() });
  assert.strictEqual(res, '[]');
});

test('runClaude NEVER passes shell:true — argv must reach the child unshredded (Windows DEP0190)', async () => {
  const cap = {};
  await runClaude({ prompt: 'x', model: 'sonnet', disallowedTools: DENY_TOOLS, spawnFn: fakeSpawnFactory(cap) });
  assert.ok(cap.options, 'spawnFn was called with an options object');
  assert.ok(!cap.options.shell, 'shell must be falsy so multi-word args are never shell-concatenated');
  assert.ok(cap.args.includes('--disallowedTools'), 'the real invocation disables tools');
});
