'use strict';
// Engine entrypoint. `node engine/index.js start --title "..." [--detach]`.
// Detach mode re-spawns itself unref'd so the engine outlives the Claude session that
// launched it (/0l:start). Everything here is wiring; logic lives in the tested modules.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { loadConfig } = require('./config');
const { appendEvent, readEvents, tailEvents } = require('./spine');
const { slugify, today, elapsedHHMMSS } = require('./util');
const { createStream } = require('./deepgram');
const { startCaptureServer } = require('./capture-server');
const { createFiring } = require('./firing');
const { createCaps } = require('./caps');
const { runClaude, DENY_TOOLS } = require('./claude');

// ── pure helpers (exported for tests) ───────────────────────────────────────
function shouldAutoStop({ now, startT, lastUtteranceT, captureStartedT, cfg }) {
  if (now - startT > cfg.max_meeting_h * 3600000) return 'max';
  if (!captureStartedT) return null; // idle clock starts at capture, not process launch
  const lastActivity = lastUtteranceT || captureStartedT;
  if (now - lastActivity > cfg.idle_stop_min * 60000) return 'idle';
  return null;
}
function buildRelaunchArgs(argv) { return argv.filter((a) => a !== '--detach'); }
function heartbeatLine({ now, startT, uttCount, windowUtt, issues }) {
  return `[0l] capturing · ${elapsedHHMMSS(now - startT)} · ${windowUtt} utt/min · ${issues} issues filed`;
}

function parseFlags(rest) {
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) flags[key] = true;
    else { flags[key] = next; i++; }
  }
  return flags;
}

async function start(flags) {
  const cfg = loadConfig(flags.config);
  const title = typeof flags.title === 'string' ? flags.title : 'Untitled meeting';
  const meetingId = `${today()}-${slugify(title)}`;
  const sessionDir = path.join(os.homedir(), '.0latency', 'sessions', meetingId);
  fs.mkdirSync(path.join(sessionDir, 'state'), { recursive: true });
  fs.mkdirSync(path.join(sessionDir, 'frames'), { recursive: true });

  if (flags.detach) {
    const logFd = fs.openSync(path.join(sessionDir, 'engine.log'), 'a');
    const child = spawn(process.execPath, [__filename, ...buildRelaunchArgs(process.argv.slice(2))],
      { detached: true, stdio: ['ignore', logFd, logFd] });
    child.unref();
    console.log(`SESSION_DIR=${sessionDir}`);
    console.log(`ENGINE_PID=${child.pid}`);
    return;
  }

  fs.writeFileSync(path.join(sessionDir, 'engine.pid'), String(process.pid));
  const eventsPath = path.join(sessionDir, 'events.jsonl');
  appendEvent(eventsPath, { type: 'meeting_meta', phase: 'start', title, slug: slugify(title), meeting_id: meetingId });
  const startT = Date.now();
  if (!cfg.deepgram_key) { console.error('[0l] no Deepgram key (env DEEPGRAM_API_KEY or config) — cannot capture'); process.exit(1); }

  const notesDir = path.join(os.homedir(), '.0latency', 'notes', cfg.notes_repo.split('/')[1] || 'notes');
  const template = fs.readFileSync(path.join(__dirname, '..', 'prompts', 'event-session.md'), 'utf8');
  const caps = createCaps(path.join(sessionDir, 'state'), cfg.caps);
  const firing = createFiring({
    sessionDir, config: cfg, caps, template, meetingId, meetingTitle: title, startT, notesDir,
    // Data-only session: NO tools (DENY_TOOLS turns them off). The engine does gh/git/fs itself.
    runSession: (prompt) => runClaude({ prompt, model: cfg.models.events, disallowedTools: DENY_TOOLS }),
  });

  let mic = null, sys = null, captureStartedT = null, lastUtteranceT = null;
  let uttCount = 0; const uttTimes = [];
  function onUtterance(u) {
    lastUtteranceT = Date.now(); uttCount++; uttTimes.push(lastUtteranceT);
    const ev = { type: 'utterance', speaker: u.speaker, text: u.text };
    appendEvent(eventsPath, ev);
    firing.onUtterance(Object.assign({ t: new Date(lastUtteranceT).toISOString() }, ev));
  }

  const server = await startCaptureServer(sessionDir, {
    port: cfg.port,
    onAudio: (tag, buf) => { if (tag === 1 && mic) mic.sendAudio(buf); else if (tag === 2 && sys) sys.sendAudio(buf); },
    onControl: (msg) => {
      if (msg.type === 'capture_start') {
        if (mic || sys) return; // already active — do nothing
        if (!captureStartedT) captureStartedT = Date.now(); // idle-clock baseline, set once
        mic = createStream({ key: cfg.deepgram_key, diarize: false, label: cfg.operator_label, onUtterance });
        sys = createStream({ key: cfg.deepgram_key, diarize: true, label: null, onUtterance });
        console.log('[0l] capture started (two streams: mic + Meet tab)');
      } else if (msg.type === 'capture_stop') {
        if (mic) mic.close(); if (sys) sys.close(); mic = sys = null;
        console.log('[0l] capture stopped by sensor');
      }
    },
  });
  console.log(`[0l] capture tab: ${server.url}`);
  console.log('[0l] RUNBOOK: share the MEET TAB with "Also share tab audio" checked. Click the preview to grab a frame.');
  try {
    const url = server.url;
    if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
    else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' });
    else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
  } catch { /* operator opens it manually */ }

  // frame events reach the firing loop by tailing our own spine (server appends them).
  // tailEvents is byte-offset resumable and per-line tolerant — a mid-write partial line
  // never blanks out the whole file the way readEvents' whole-file try/catch would.
  const tailOffsetPath = path.join(sessionDir, 'state', 'frame-tail.offset');
  const tailTimer = setInterval(() => {
    for (const e of tailEvents(eventsPath, tailOffsetPath)) {
      if (e.type === 'frame') firing.onFrame(Object.assign({}, e, { path: path.join(sessionDir, e.path) }));
    }
  }, 2000);

  const fireTimer = setInterval(() => { firing.tick().catch(() => {}); }, 60000);
  const heartTimer = setInterval(() => {
    const now = Date.now();
    while (uttTimes.length && uttTimes[0] < now - 60000) uttTimes.shift();
    const issues = readEvents(eventsPath).filter((e) => e.type === 'action_taken').length;
    const line = heartbeatLine({ now, startT, uttCount, windowUtt: uttTimes.length, issues });
    console.log(line);
    try { fs.writeFileSync(path.join(sessionDir, 'status.txt'), line); } catch {}
  }, 15000);

  const sentinel = path.join(sessionDir, 'stop.sentinel');
  await new Promise((resolve) => {
    const stopTimer = setInterval(() => {
      const reason = fs.existsSync(sentinel) ? 'finish'
        : shouldAutoStop({ now: Date.now(), startT, lastUtteranceT, captureStartedT, cfg });
      if (!reason) return;
      clearInterval(stopTimer); clearInterval(fireTimer); clearInterval(heartTimer); clearInterval(tailTimer);
      (async () => {
        console.log(`[0l] stopping (${reason})`);
        if (mic) mic.close(); if (sys) sys.close();
        await firing.tick().catch(() => {});   // flush the last batch
        await server.stop();
        appendEvent(eventsPath, { type: 'meeting_meta', phase: 'end', title, reason });
        fs.writeFileSync(path.join(sessionDir, 'stopped.marker'), reason);
        if (reason !== 'finish') console.log('[0l] auto-stopped — run /0l:finish to get the summary and commit the transcript');
        resolve();
      })().catch((e) => { console.error('[0l] stop error:', e.message); resolve(); });
    }, 1000);
  });
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  if (cmd === 'start') return start(flags);
  console.log('usage: node engine/index.js start --title "Meeting title" [--detach] [--config path]');
  process.exitCode = 1;
}

if (require.main === module) main().catch((e) => { console.error('[0l] fatal:', e); process.exitCode = 1; });
module.exports = { shouldAutoStop, buildRelaunchArgs, heartbeatLine, parseFlags };
