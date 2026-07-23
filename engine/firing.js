'use strict';
// The streaming trigger (design B1): batch gated candidates every ~60s; in auto mode spawn
// ONE scoped event session per batch which routes, grounds, and files the issues itself;
// in review mode drain drafts to queue.md for /0l:finish. Log and continue everywhere.
const fs = require('fs');
const path = require('path');
const { isCandidate } = require('./gate');
const { appendEvent } = require('./spine');
const { elapsedHHMMSS } = require('./util');
const { stripFences } = require('./claude');

function fmtLine(ev, startT) {
  return `${elapsedHHMMSS(Date.parse(ev.t) - startT)} | ${ev.speaker} | ${ev.text}`;
}

function buildEventPrompt({ template, meetingId, meetingTitle, batch, context = [], frames, config, notesDir, startT }) {
  const sub = {
    MEETING_ID: meetingId,
    MEETING_TITLE: meetingTitle,
    CANDIDATES: batch.map((e) => fmtLine(e, startT)).join('\n') || '(none)',
    CONTEXT: context.map((e) => fmtLine(e, startT)).join('\n') || '(none)',
    FRAMES: frames.map((f) => `${f.path} | ${elapsedHHMMSS(Date.parse(f.t) - startT)} | ${f.trigger || 'change'}`).join('\n') || '(none)',
    REPOS: (config.repos || []).map((r) => `${r.name} : ${r.hint || ''}`).join('\n') || '(no roster — use the default repo)',
    DEFAULT_REPO: config.default_repo,
    NOTES_REPO: config.notes_repo,
    NOTES_DIR: notesDir,
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => (k in sub ? sub[k] : `{{${k}}}`));
}

function createFiring({ sessionDir, config, caps, runSession, template, meetingId, meetingTitle, startT, notesDir = '', log = console }) {
  const eventsPath = path.join(sessionDir, 'events.jsonl');
  const queuePath = path.join(sessionDir, 'queue.md');
  const pending = [];   // gated candidate utterances
  const context = [];   // rolling recent utterances (3 min window)
  const frames = [];    // all frame events so far
  let saidExecStub = false;

  function onUtterance(ev) {
    context.push(ev);
    const cutoff = Date.parse(ev.t) - 180000;
    while (context.length && Date.parse(context[0].t) < cutoff) context.shift();
    if (isCandidate(ev.text)) pending.push(ev);
  }
  function onFrame(ev) { frames.push(ev); }

  function drainToQueue(batch) {
    const lines = batch.map((e) => `- [ ] **${e.text.slice(0, 80)}** — ${e.speaker}, ${elapsedHHMMSS(Date.parse(e.t) - startT)}`);
    fs.appendFileSync(queuePath, lines.join('\n') + '\n');
    log.log(`[0l] ${batch.length} draft(s) queued for review (creation=review)`);
  }

  async function tick() {
    if (config.execution === 'on' && !saidExecStub) {
      saidExecStub = true;
      log.log('[0l] execution=on is not implemented in v0.1 (Phase 2) — issues are created only');
    }
    if (!pending.length) return;
    const batch = pending.splice(0);
    if (config.creation !== 'auto') return drainToQueue(batch);
    if (!caps.take('events')) return; // caps logs the reason
    try {
      const reply = await runSession(buildEventPrompt({
        template, meetingId, meetingTitle, batch, context: context.slice(), frames: frames.slice(),
        config, notesDir, startT,
      }));
      const parsed = JSON.parse(stripFences(String(reply)));
      for (const r of Array.isArray(parsed) ? parsed : []) {
        if (r && r.url) {
          appendEvent(eventsPath, { type: 'action_taken', title: r.title, repo: r.repo, url: r.url, frame: r.frame || null });
          log.log(`[0l] issue filed: ${r.title} -> ${r.url}`);
        }
      }
    } catch (e) {
      log.error('[0l] event session failed (batch dropped, meeting continues):', e.message);
    }
  }

  return { onUtterance, onFrame, tick, pendingCount: () => pending.length };
}

module.exports = { createFiring, buildEventPrompt };
