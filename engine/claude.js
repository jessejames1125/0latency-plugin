'use strict';
// Headless Claude spawner. THE central rule of this repo: no spawn, ever, uses
// --dangerously-skip-permissions. Event sessions are DATA-ONLY — every side-effect tool is
// disabled via --disallowedTools (DENY_TOOLS), because --allowedTools does not sandbox (see
// the SECURITY note below). parseClaudeOutput + OUTPUT_GUARD copied from 0latency pipeline/llm.js
// (hooks print before the JSON envelope; read the envelope's `result`, never raw stdout).
const { spawn, execFileSync } = require('child_process');

// Resolve the claude binary WITHOUT shell:true. `shell:true` makes Node join argv with
// spaces and no quoting (Node DEP0190) — that shreds multi-word --allowedTools entries like
// `Bash(git add:*)` and the long --append-system-prompt guard on every Windows spawn. So we
// always spawn with shell:false and instead resolve the actual executable path/name here:
// CLAUDE_BIN env wins if set; on win32 `spawn` with shell:false won't consult PATHEXT, so we
// ask `where` for the first of claude.cmd/claude.exe/claude that resolves, falling back to
// the bare literal (which will fail loudly rather than silently misbehave) if none do.
function resolveClaudeBin() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  if (process.platform !== 'win32') return 'claude';
  for (const candidate of ['claude.cmd', 'claude.exe', 'claude']) {
    try {
      const out = execFileSync('where', [candidate], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      const first = out.split(/\r?\n/).find(Boolean);
      if (first) return first.trim();
    } catch { /* not found on PATH, try next */ }
  }
  return 'claude';
}

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

// SECURITY (2026-07-23): `--allowedTools` does NOT sandbox — proven empirically, it pre-approves
// listed tools but the session still inherits the operator's ambient permissions and can read
// files / run commands never in the list. So event sessions get NO tools and produce DATA ONLY;
// the engine performs every side effect (gh, git, fs) deterministically. `--disallowedTools`
// DOES turn tools off (proven), so we deny every built-in that could read/write/execute/network —
// defence in depth against prompt-injection from untrusted meeting audio. See the design doc's
// CRITICAL SECURITY FINDING banner.
const DENY_TOOLS = [
  'Bash', 'Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit',
  'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task', 'BashOutput', 'KillShell',
];

const stripFences = (s) => String(s).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

// The event session is deliberately isolated from the operator's ambient Claude Code environment,
// which we do NOT control and which differs per machine/person:
//   --disallowedTools DENY_TOOLS  : deny every built-in that can read/write/execute/network.
//   --strict-mcp-config           : load NO MCP servers (the deny-list can't enumerate the
//                                   operator's mcp__* tools; this removes them wholesale).
//   --setting-sources project     : do NOT load user/local settings — that's where SessionStart
//                                   hooks (any operator's boot greeting), output styles, and
//                                   permissive allow-rules live. Combined with a clean cwd (the
//                                   session dir, which has no .claude/), the session inherits
//                                   nothing operator-specific.
//   --append-system-prompt GUARD  : belt-and-suspenders against stray preamble.
function buildArgs({ model, disallowedTools = [] }) {
  const args = ['-p', '--output-format', 'json', '--model', model, '--strict-mcp-config', '--setting-sources', 'project'];
  if (disallowedTools.length) args.push('--disallowedTools', ...disallowedTools);
  args.push('--append-system-prompt', OUTPUT_GUARD);
  return args;
}

function runClaude({ prompt, model, disallowedTools = [], spawnFn = spawn, cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawnFn(resolveClaudeBin(), buildArgs({ model, disallowedTools }),
      { shell: false, cwd, stdio: ['pipe', 'pipe', 'pipe'] });
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

module.exports = { runClaude, buildArgs, parseClaudeOutput, stripFences, DENY_TOOLS, OUTPUT_GUARD, resolveClaudeBin };
