'use strict';
// The streaming trigger (design B1), post-security-fix. Every ~60s a batch of gated candidates
// is sent to ONE data-only event session (the LLM has no tools; see engine/claude.js). It returns
// findings as JSON; THE ENGINE then does every side effect deterministically — repo validation,
// frame commit (notes.js), and issue filing (gh.js). An LLM that cannot act cannot be
// prompt-injected by meeting audio into reading files or running commands. Log and continue.
const fs = require('fs');
const path = require('path');
const { isCandidate } = require('./gate');
const { appendEvent } = require('./spine');
const { elapsedHHMMSS } = require('./util');
const { stripFences } = require('./claude');
const ghDefault = require('./gh');
const notesDefault = require('./notes');

function fmtLine(ev, startT) {
  return `${elapsedHHMMSS(Date.parse(ev.t) - startT)} | ${ev.speaker} | ${ev.text}`;
}

// hh:mm:ss -> ms (null on unparseable)
function elapsedToMs(s) {
  const m = String(s || '').match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  return m ? ((+m[1] * 3600 + +m[2] * 60 + +m[3]) * 1000) : null;
}

// Pull the findings array out of a reply that may be wrapped in prose or a code fence. A
// `claude -p` session inherits the operator's SessionStart hooks, so a hook that forces a
// greeting (e.g. "[JARVIS BOOT] ...") can prepend text to the model's result — parsing the
// whole result as JSON would then throw and silently drop the batch. Extract the outermost
// [...] instead. Returns [] on anything unrecoverable.
function extractFindings(reply) {
  const s = stripFences(String(reply == null ? '' : reply));
  try { const a = JSON.parse(s); if (Array.isArray(a)) return a; } catch { /* wrapped in prose */ }
  // Try each '[' as an array start; a balanced string-aware scan finds its close, so a bracket
  // inside prose like "[JARVIS BOOT]" fails to parse and we move on to the real array.
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '[') continue;
    const arr = scanBalanced(s, i);
    if (Array.isArray(arr)) return arr;
  }
  return [];
}
function scanBalanced(s, start) {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') { if (--depth === 0) { try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

function buildEventPrompt({ template, meetingId, meetingTitle, batch, context = [], config, startT }) {
  const sub = {
    MEETING_ID: meetingId,
    MEETING_TITLE: meetingTitle,
    CANDIDATES: batch.map((e) => fmtLine(e, startT)).join('\n') || '(none)',
    CONTEXT: context.map((e) => fmtLine(e, startT)).join('\n') || '(none)',
    REPOS: (config.repos || []).map((r) => `${r.name} : ${r.hint || ''}`).join('\n') || '(no roster — use the default repo)',
    DEFAULT_REPO: config.default_repo,
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => (k in sub ? sub[k] : `{{${k}}}`));
}

// The issue body — built by the engine, not the LLM, so its structure and the frame retrieval
// snippet are fixed. Two audiences: humans (inline image) and agents (SHA-pinned fetch line).
function buildBody({ finding, speaker, framed, notesRepo, meetingTitle }) {
  const out = ['## Finding',
    `> "${finding.evidence || finding.title}"${speaker ? ` — ${speaker}` : ''}${finding.evidence_elapsed ? `, ${finding.evidence_elapsed}` : ''}`,
    '', finding.body || ''];
  if (framed && framed.committed) {
    out.push('', '## Evidence', `![frame](${framed.rawUrl})`, '',
      '### Frame (for agents)', `- repo: ${notesRepo}`, `- sha: ${framed.sha}`, `- path: ${framed.rel}`, '',
      'Fetch and read it:', '',
      `    gh api -H "Accept: application/vnd.github.raw" "repos/${notesRepo}/contents/${framed.rel}?ref=${framed.sha}" > frame.png`,
      '', 'Then read frame.png (it is an image).');
  } else if (framed) {
    out.push('', '_frame pending — capture succeeded but the push failed; it will be back-filled at /0l:finish_');
  }
  out.push('', '## Ground rules',
    'Claim by assigning yourself. Post progress on this issue, not in chat.',
    `Filed automatically by 0latency during "${meetingTitle}".`);
  return out.join('\n');
}

function createFiring({ sessionDir, config, caps, runSession, template, meetingId, meetingTitle, startT,
  notesDir = '', gh = ghDefault, notes = notesDefault, log = console }) {
  const eventsPath = path.join(sessionDir, 'events.jsonl');
  const queuePath = path.join(sessionDir, 'queue.md');
  const pending = [];   // gated candidate utterances awaiting a tick
  const context = [];   // rolling recent utterances (3 min window)
  const frames = [];    // frame events so far: { t, path(abs), seq }
  let saidExecStub = false;
  let ticking = false;  // in-flight guard: a slow session must not overlap the next tick

  function onUtterance(ev) {
    context.push(ev);
    const cutoff = Date.parse(ev.t) - 180000;
    while (context.length && Date.parse(context[0].t) < cutoff) context.shift();
    if (isCandidate(ev.text)) pending.push(ev);
  }
  function onFrame(ev) {
    const seq = parseInt((String(ev.path).match(/(\d+)\.(?:a\.)?png$/) || [])[1], 10) || (frames.length + 1);
    frames.push({ t: ev.t, path: ev.path, seq });
  }

  function drainToQueue(batch) {
    const lines = batch.map((e) => `- [ ] **${e.text.slice(0, 80)}** — ${e.speaker}, ${elapsedHHMMSS(Date.parse(e.t) - startT)}`);
    fs.appendFileSync(queuePath, lines.join('\n') + '\n');
    log.log(`[0l] ${batch.length} draft(s) queued for review (creation=review)`);
  }

  // Nearest frame captured AT or BEFORE the finding's evidence time, within 60s.
  function nearestFrame(evidenceElapsed) {
    const evMs = elapsedToMs(evidenceElapsed);
    if (evMs == null) return null;
    let best = null;
    for (const f of frames) {
      const fMs = Date.parse(f.t) - startT;
      if (fMs <= evMs + 1000 && evMs - fMs <= 60000) {
        if (!best || fMs > (Date.parse(best.t) - startT)) best = f;
      }
    }
    return best;
  }

  async function fileFinding(finding, batch) {
    if (!finding || !finding.title) return;
    const roster = new Set((config.repos || []).map((r) => r.name));
    let repo = finding.repo;
    let unsure = finding.confidence === 'low';
    if (!repo || !roster.has(repo)) { repo = config.default_repo; unsure = true; }

    // Dedupe against the live backlog before creating.
    const existing = await gh.findOpenIssue(repo, finding.title);
    if (existing) { log.log(`[0l] duplicate, skipped: ${finding.title} (open #${existing} in ${repo})`); return; }

    const frame = nearestFrame(finding.evidence_elapsed);
    let framed = null;
    if (frame) {
      try {
        framed = await notes.commitFrame({ notesDir, meetingId, notesRepo: config.notes_repo, frameAbsPath: frame.path, seq: frame.seq });
      } catch (e) { log.error('[0l] frame commit failed (issue files without it):', e.message); framed = { committed: false }; }
    }
    const evMatch = batch.find((e) => e.text === finding.evidence);
    const labels = ['0l:ready', `0l:mtg-${meetingId}`]; if (unsure) labels.push('0l:route-unsure');
    const body = buildBody({ finding, speaker: evMatch && evMatch.speaker, framed, notesRepo: config.notes_repo, meetingTitle });

    await gh.ensureLabels(repo, labels);
    const { url } = await gh.createIssue({ repo, title: finding.title.slice(0, 80), body, labels });
    appendEvent(eventsPath, { type: 'action_taken', title: finding.title.slice(0, 80), repo, url, frame: framed && framed.committed ? framed.rel : null });
    log.log(`[0l] issue filed: ${finding.title} -> ${url}`);
  }

  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      if (config.execution === 'on' && !saidExecStub) {
        saidExecStub = true;
        log.log('[0l] execution=on is not implemented in v0.1 (Phase 2) — issues are created only');
      }
      if (!pending.length) return;
      const batch = pending.splice(0);
      if (config.creation !== 'auto') return drainToQueue(batch);
      if (!caps.take('events')) return; // caps logs the reason

      let findings;
      try {
        const reply = await runSession(buildEventPrompt({ template, meetingId, meetingTitle, batch, context: context.slice(), config, startT }));
        findings = extractFindings(reply);
      } catch (e) {
        log.error('[0l] event session failed (batch dropped, meeting continues):', e.message);
        return;
      }
      for (const f of findings) {
        try { await fileFinding(f, batch); }
        catch (e) { log.error('[0l] filing a finding failed (continuing):', e.message); }
      }
    } finally {
      ticking = false;
    }
  }

  return { onUtterance, onFrame, tick, pendingCount: () => pending.length };
}

module.exports = { createFiring, buildEventPrompt, buildBody, elapsedToMs, extractFindings };
