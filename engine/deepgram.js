'use strict';
// Raw Deepgram live client over `ws` — no @deepgram/sdk (dependency budget). One instance
// per audio stream: the mic stream gets a fixed operator label and diarize=false; the
// Meet-tab stream gets diarize=true and "speaker N" labels. Auto-reconnect with backoff:
// a dropped socket mid-meeting must not silently kill the transcript (design: Reliability).
const WebSocket = require('ws');

function buildUrl({ diarize }) {
  const q = new URLSearchParams({
    model: 'nova-3', encoding: 'linear16', sample_rate: '16000', channels: '1',
    interim_results: 'false', smart_format: 'true',
  });
  if (diarize) q.set('diarize', 'true');
  return `wss://api.deepgram.com/v1/listen?${q}`;
}

// Split on per-word speaker changes: tagging a whole utterance with words[0].speaker
// misattributes crosstalk (rationale copied from 0latency orchestrator.js).
function splitBySpeaker(alt) {
  if (!alt.words || !alt.words.length) return [{ text: alt.transcript, spk: undefined }];
  const parts = [];
  for (const w of alt.words) {
    const wt = w.punctuated_word || w.word;
    const last = parts[parts.length - 1];
    if (last && last.spk === w.speaker) last.text += ' ' + wt;
    else parts.push({ text: wt, spk: w.speaker });
  }
  return parts;
}

function createStream({ key, diarize, label, onUtterance, wsCtor = WebSocket, log = console }) {
  let ws = null, closedByUs = false, attempts = 0, timer = null;
  const tag = label ? 'mic' : 'sys';

  function connect() {
    ws = new wsCtor(buildUrl({ diarize }), { headers: { Authorization: `Token ${key}` } });
    ws.on('open', () => { attempts = 0; log.log(`[deepgram:${tag}] open`); });
    ws.on('message', (data) => {
      let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
      const alt = msg.channel && msg.channel.alternatives && msg.channel.alternatives[0];
      if (!alt || !alt.transcript || !msg.is_final) return;
      for (const p of splitBySpeaker(alt)) {
        onUtterance({ speaker: label || (p.spk == null ? 'unknown' : `speaker ${p.spk}`), text: p.text });
      }
    });
    ws.on('error', (e) => log.error(`[deepgram:${tag}] error:`, e.message));
    ws.on('close', () => { if (!closedByUs) scheduleReconnect(); });
  }

  function scheduleReconnect() {
    attempts++;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(attempts - 1, 5));
    log.log(`[deepgram:${tag}] reconnecting in ${delay}ms (attempt ${attempts})`);
    timer = setTimeout(connect, delay);
  }

  connect();
  return {
    sendAudio(buf) { if (ws && ws.readyState === 1) ws.send(buf); },
    close() {
      closedByUs = true;
      clearTimeout(timer);
      try { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'CloseStream' })); } catch {}
      try { ws && ws.close(); } catch {}
    },
  };
}

module.exports = { createStream, splitBySpeaker, buildUrl };
