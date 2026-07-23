'use strict';
// Scoped headless Claude spawner. THE central rule of this repo: no spawn, ever, uses
// --dangerously-skip-permissions. Event sessions get exactly EVENT_TOOLS and nothing else.
// parseClaudeOutput + OUTPUT_GUARD copied from 0latency pipeline/llm.js (hooks print before
// the JSON envelope; read the envelope's `result`, never raw stdout).
const { spawn } = require('child_process');

// `claude -p` is a full Claude Code session and inherits the operator's global config, so a
// SessionStart hook's greeting arrives on stdout ahead of the answer. Read the JSON envelope's
// `result` instead of raw stdout, and refuse rather than guess — anything else is how a hook
// line ends up as the first sentence of a meeting summary.
function parseClaudeOutput(stdout) {
  const s = String(stdout == null ? '' : stdout);
  const start = s.indexOf('{');
  if (start !== -1) {
    // Hooks print before the envelope; the envelope is the last complete JSON object.
    for (let i = start; i !== -1; i = s.indexOf('{', i + 1)) {
      let parsed;
      try { parsed = JSON.parse(s.slice(i)); } catch { continue; }
      if (parsed && typeof parsed === 'object' && 'result' in parsed) {
        if (parsed.is_error) throw new Error(String(parsed.result || 'claude reported an error'));
        return String(parsed.result).trim();
      }
    }
  }
  throw new Error(`claude returned no result envelope (got ${s.length} chars of stdout)`);
}

// `claude -p` inherits the operator's whole Claude Code setup — hooks, output styles, CLAUDE.md.
// A SessionStart hook saying "open with a greeting" produces exactly that, inside `result`, at
// the top of a meeting summary. The guard is a system prompt, which outranks injected context.
// `--bare` would also skip hooks and CLAUDE.md discovery, but it forces ANTHROPIC_API_KEY auth
// and dies with "Not logged in" on a subscription login — so it is opt-in on having a key.
const OUTPUT_GUARD =
  'Output only what the user asks for. Do not greet anyone, do not address the user by name, '
  + 'and do not add a preamble, a persona, a status line, or repository information. '
  + 'Your entire reply is the requested content and nothing else.';

const EVENT_TOOLS = [
  'Read',
  'Bash(cp:*)', 'Bash(mkdir:*)', 'Bash(sleep:*)',
  'Bash(git add:*)', 'Bash(git commit:*)', 'Bash(git push:*)', 'Bash(git pull:*)', 'Bash(git rev-parse:*)',
  'Bash(gh label create:*)', 'Bash(gh issue create:*)', 'Bash(gh issue list:*)', 'Bash(gh api:*)',
];

const stripFences = (s) => String(s).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

function buildArgs({ model, allowedTools }) {
  return ['-p', '--output-format', 'json', '--model', model,
    '--allowedTools', ...allowedTools,
    '--append-system-prompt', OUTPUT_GUARD];
}

function runClaude({ prompt, model, allowedTools, spawnFn = spawn, cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawnFn('claude', buildArgs({ model, allowedTools }),
      { shell: process.platform === 'win32', cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      try { return resolve(parseClaudeOutput(out)); }
      catch (e) {
        reject(new Error(String(err || '').trim() || (code !== 0 ? `claude exited ${code}` : e.message)));
      }
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

module.exports = { runClaude, buildArgs, parseClaudeOutput, stripFences, EVENT_TOOLS, OUTPUT_GUARD };
