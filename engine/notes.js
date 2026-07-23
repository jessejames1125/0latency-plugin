'use strict';
// Deterministic frame publishing — the engine (not the LLM) copies a captured frame into the
// notes-repo clone and pushes it, so issues can carry an AI-ingestible image via a stable,
// SHA-pinned raw URL. gh can't attach images; a committed PNG is fully readable by a downstream
// agent. The git runner is injectable so tests never touch a real repo. Log and continue: a
// push failure returns committed:false and the caller marks the issue "frame pending".
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

function defaultRun(cwd, args) {
  return new Promise((resolve) => {
    execFile('git', ['-C', cwd, ...args], { shell: false }, (err, stdout, stderr) =>
      resolve({ ok: !err, out: String(stdout || stderr || (err && err.message) || '').trim() }));
  });
}

const pad4 = (n) => String(n).padStart(4, '0');

// Copy frame into <notesDir>/docs/meetings/<id>/frames/<seq>.png, commit, push (fallback branch
// on protected-main rejection). Returns { committed, sha, rel, rawUrl }.
async function commitFrame({ notesDir, meetingId, notesRepo, frameAbsPath, seq }, run = defaultRun) {
  const rel = `docs/meetings/${meetingId}/frames/${pad4(seq)}.png`;
  const dest = path.join(notesDir, rel);
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(frameAbsPath, dest);
  } catch (e) { return { committed: false, error: `copy failed: ${e.message}`, rel }; }

  await run(notesDir, ['pull', '--rebase']);          // best effort; ignore result
  await run(notesDir, ['add', rel]);
  await run(notesDir, ['commit', '-m', `0l: frame ${meetingId}/${pad4(seq)}`]);
  let push = await run(notesDir, ['push']);
  if (!push.ok) push = await run(notesDir, ['push', 'origin', 'HEAD:0latency/meetings']);
  const sha = (await run(notesDir, ['rev-parse', 'HEAD'])).out.split('\n')[0] || '';
  const rawUrl = sha ? `https://github.com/${notesRepo}/raw/${sha}/${rel}` : null;
  return { committed: !!push.ok && !!sha, sha, rel, rawUrl };
}

module.exports = { commitFrame, defaultRun, pad4 };
