'use strict';
// Deterministic GitHub actions — the engine files issues itself (NOT the LLM), so a data-only
// event session cannot be prompt-injected into arbitrary gh calls. All args are fixed and
// parameterised; no shell. The runner is injectable so tests never touch the network.
const { execFile } = require('child_process');

function defaultRun(args) {
  return new Promise((resolve, reject) => {
    execFile('gh', args, { shell: false }, (err, stdout, stderr) =>
      err ? reject(new Error(String(stderr || err.message).trim().split('\n').filter(Boolean).pop() || 'gh failed'))
          : resolve(String(stdout).trim()));
  });
}

const normTitle = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

async function ensureLabels(repo, labels, run = defaultRun) {
  for (const l of labels) { try { await run(['label', 'create', l, '--repo', repo, '--force']); } catch { /* best effort */ } }
}

// Cross-batch/cross-meeting dedupe: is an OPEN issue with this normalized title already there?
async function findOpenIssue(repo, title, run = defaultRun) {
  try {
    const out = await run(['issue', 'list', '--repo', repo, '--state', 'open', '--search', title, '--json', 'number,title', '--limit', '30']);
    const want = normTitle(title);
    const hit = (JSON.parse(out || '[]') || []).find((i) => normTitle(i.title) === want);
    return hit ? String(hit.number) : null;
  } catch { return null; }
}

async function createIssue({ repo, title, body, labels }, run = defaultRun) {
  const out = await run(['issue', 'create', '--repo', repo, '--title', title, '--body', body, '--label', labels.join(',')]);
  const url = out.split('\n').find((l) => l.startsWith('http')) || out;
  return { url, number: (url.match(/\/(\d+)$/) || [])[1] };
}

module.exports = { ensureLabels, findOpenIssue, createIssue, normTitle, defaultRun };
