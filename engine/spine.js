'use strict';
// The spine (mtgd §3, ported). One append-only events.jsonl per meeting is the durable,
// crash-safe, replayable interface between every in-process consumer and every future
// external tool/agent. All writers live in the one supervisor process, so append atomicity
// is trivial; the file exists so CONSUMERS get a byte-offset-resumable, parse-tolerant log.
// Contract: specs/007-mtgd/contracts/event-schema.md
const fs = require('fs');
const path = require('path');

const MAX_TEXT = 3500;          // any `text` field is hard-truncated to this + one ellipsis
const MAX_LINE_BYTES = 3800;    // a serialized line over this is a bug, not a runtime path
const ELLIPSIS = '…';

// Exhaustive per §5.2 — a new type requires a BUILD_NOTES.md entry AND an edit here.
const EVENT_TYPES = new Set([
  'meeting_meta', 'utterance', 'frame', 'frame_note', 'annotation_failed',
  'agenda_ref', 'action_proposed', 'action_taken', 'action_rejected', 'budget_exceeded',
]);

// Truncate every field literally named `text` (utterance, frame_note, …). Deep-ish but
// shallow by design: events are flat, so a single top-level pass is the whole contract.
function truncateText(event) {
  const out = { ...event };
  for (const k of Object.keys(out)) {
    if (k === 'text' && typeof out[k] === 'string' && out[k].length > MAX_TEXT) {
      out[k] = out[k].slice(0, MAX_TEXT) + ELLIPSIS;
    }
  }
  return out;
}

// appendEvent(path, event): stamp t if absent, validate type, truncate text, assert byte
// length, append single-line JSON + "\n" with flag "a".
function appendEvent(eventsPath, event) {
  if (!event || typeof event.type !== 'string' || !EVENT_TYPES.has(event.type)) {
    throw new Error(`spine: unknown or missing event type "${event && event.type}"`);
  }
  const stamped = truncateText({ t: event.t || new Date().toISOString(), ...event });
  // t may have been supplied inside event; the spread above lets an explicit event.t win.
  if (!stamped.t) stamped.t = new Date().toISOString();
  const line = JSON.stringify(stamped);
  const bytes = Buffer.byteLength(line, 'utf8');
  if (bytes > MAX_LINE_BYTES) {
    throw new Error(`spine: serialized event is ${bytes} bytes (> ${MAX_LINE_BYTES}) — type ${stamped.type}`);
  }
  fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
  fs.appendFileSync(eventsPath, line + '\n', { flag: 'a' });
  return stamped;
}

function readOffset(offsetFile) {
  try { return parseInt(fs.readFileSync(offsetFile, 'utf8'), 10) || 0; } catch { return 0; }
}

function bumpLog(logFile) {
  let n = 0;
  try { n = parseInt(fs.readFileSync(logFile, 'utf8'), 10) || 0; } catch { /* first failure */ }
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.writeFileSync(logFile, String(n + 1), 'utf8');
}

// tailEvents(path, offsetFile): read from the persisted byte offset, return parsed objects
// for COMPLETE lines only (a partial trailing line is held for the next poll), advance the
// offset only past complete lines, count parse failures in the sibling <consumer>.log and
// continue — a garbage line never throws and never blocks the stream.
function tailEvents(eventsPath, offsetFile) {
  if (!fs.existsSync(eventsPath)) return [];
  const logFile = offsetFile.replace(/\.offset$/, '') + '.log';
  const start = readOffset(offsetFile);
  const buf = fs.readFileSync(eventsPath);
  if (start >= buf.length) return [];

  const slice = buf.subarray(start);
  const lastNl = slice.lastIndexOf(0x0a); // last newline byte
  if (lastNl < 0) return []; // no complete line yet — hold everything

  const complete = slice.subarray(0, lastNl).toString('utf8'); // excludes the trailing partial
  const consumed = lastNl + 1; // bytes up to and including that newline

  const events = [];
  for (const raw of complete.split('\n')) {
    if (!raw) continue;
    try { events.push(JSON.parse(raw)); } catch { bumpLog(logFile); }
  }

  fs.mkdirSync(path.dirname(offsetFile), { recursive: true });
  fs.writeFileSync(offsetFile, String(start + consumed), 'utf8');
  return events;
}

function readEvents(p) {
  try { return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); }
  catch { return []; }
}

module.exports = { appendEvent, tailEvents, readEvents, EVENT_TYPES, MAX_TEXT, MAX_LINE_BYTES };
