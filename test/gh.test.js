'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { ensureLabels, findOpenIssue, createIssue, normTitle } = require('../engine/gh');

// A recording fake runner — proves the engine builds exact, fixed gh argv (no shell, no LLM).
function recorder(responses = {}) {
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    const key = args.slice(0, 2).join(' ');
    if (key in responses) return responses[key];
    if (args[0] === 'issue' && args[1] === 'create') return 'https://github.com/acme/app/issues/7';
    return '';
  };
  run.calls = calls;
  return run;
}

test('createIssue passes fixed argv and parses url + number', async () => {
  const run = recorder();
  const { url, number } = await createIssue({ repo: 'acme/app', title: 'Fix it', body: 'B', labels: ['0l:ready', '0l:mtg-x'] }, run);
  assert.strictEqual(url, 'https://github.com/acme/app/issues/7');
  assert.strictEqual(number, '7');
  const argv = run.calls[0];
  assert.deepStrictEqual(argv.slice(0, 6), ['issue', 'create', '--repo', 'acme/app', '--title', 'Fix it']);
  assert.ok(argv.includes('--label') && argv.includes('0l:ready,0l:mtg-x'));
});

test('findOpenIssue returns the number on a normalized-title match, else null', async () => {
  const hit = recorder({ 'issue list': JSON.stringify([{ number: 12, title: 'Fix  the Export-Button!' }]) });
  assert.strictEqual(await findOpenIssue('acme/app', 'fix the export button', hit), '12');
  const miss = recorder({ 'issue list': JSON.stringify([{ number: 3, title: 'Unrelated' }]) });
  assert.strictEqual(await findOpenIssue('acme/app', 'fix the export button', miss), null);
});

test('findOpenIssue swallows a runner failure and returns null (dedupe never blocks filing)', async () => {
  const boom = async () => { throw new Error('gh offline'); };
  assert.strictEqual(await findOpenIssue('acme/app', 'x', boom), null);
});

test('ensureLabels is best-effort — a label failure does not throw', async () => {
  const flaky = async (args) => { if (args[2] === 'boom') throw new Error('nope'); return ''; };
  await assert.doesNotReject(ensureLabels('acme/app', ['ok', 'boom'], flaky));
});

test('normTitle collapses case/punctuation/space', () => {
  assert.strictEqual(normTitle('Fix  the Export-Button!'), 'fix the export button');
});
