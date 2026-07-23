'use strict';
// Capture head server. 127.0.0.1 HTTP+WS. Serves capture.html (a SENSOR, not a console),
// relays TAGGED browser PCM (byte0: 1=mic, 2=sys) to onAudio, control JSON to onControl,
// and receives frame PNGs -> frames/NNNN[.a].png + frame events. Adapted from 0latency
// pipeline/capture-server.js; Deepgram wiring moved up to the engine (two streams).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { appendEvent } = require('./spine');

// A highlight must be a normalized rect inside [0,1] (copied check from 0latency mock.js).
function validHighlight(h) {
  return h && [h.x, h.y, h.w, h.h].every((v) => typeof v === 'number' && v >= 0 && v <= 1)
    && h.x + h.w <= 1.0001 && h.y + h.h <= 1.0001 && h.w > 0 && h.h > 0;
}

function startCaptureServer(sessionDir, { port, onAudio, onControl }) {
  const eventsPath = path.join(sessionDir, 'events.jsonl');
  const framesDir = path.join(sessionDir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });
  const html = fs.readFileSync(path.join(__dirname, 'capture.html'), 'utf8');
  const frameDiffJs = fs.readFileSync(path.join(__dirname, 'frame-diff.js'), 'utf8');

  let frameSeq = 0;
  const pad4 = (n) => String(n).padStart(4, '0');
  const decodeDataUrl = (d) => Buffer.from(String(d).replace(/^data:image\/png;base64,/, ''), 'base64');

  function writeFrame({ raw, highlighted, highlight, trigger }) {
    frameSeq++;
    const name = pad4(frameSeq);
    try {
      fs.writeFileSync(path.join(framesDir, `${name}.png`), decodeDataUrl(raw)); // bytes first
      const ev = { type: 'frame', path: `frames/${name}.png`, trigger: trigger || 'button' };
      if (highlight && validHighlight(highlight) && highlighted) {
        fs.writeFileSync(path.join(framesDir, `${name}.a.png`), decodeDataUrl(highlighted));
        ev.highlight = highlight;
      } else if (highlight) {
        console.warn(`[capture] dropping out-of-range highlight on frame ${name}`);
      }
      appendEvent(eventsPath, ev); // pointer after bytes
    } catch (e) { console.error('[capture] frame write failed:', e.message); }
  }

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
      res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); return;
    }
    if (req.method === 'GET' && req.url === '/frame-diff.js') {
      res.writeHead(200, { 'content-type': 'application/javascript' }); res.end(frameDiffJs); return;
    }
    if (req.method === 'POST' && req.url === '/frame') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 40 * 1024 * 1024) req.destroy(); });
      req.on('end', () => { try { writeFrame(JSON.parse(body)); res.writeHead(200); res.end('ok'); } catch (e) { res.writeHead(400); res.end(e.message); } });
      return;
    }
    res.writeHead(404); res.end();
  });

  server.on('error', (e) => console.error('[capture] server error:', e.message));

  const wss = new WebSocketServer({ server });
  wss.on('error', (e) => console.error('[capture] websocket server error:', e.message));
  let client = null;
  wss.on('connection', (ws) => {
    client = ws;
    ws.on('error', (e) => console.error('[capture] client socket error:', e.message));
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const buf = Buffer.from(data);
        if (buf.length > 1) onAudio(buf[0], buf.subarray(1));
        return;
      }
      let msg; try { msg = JSON.parse(data.toString()); } catch { return; }
      onControl(msg);
    });
    ws.on('close', () => { if (client === ws) client = null; });
  });

  return new Promise((resolve, reject) => {
    // Bind the listen-time error handler BEFORE calling listen() so an EADDRINUSE (e.g. a
    // stale engine already holding the port) rejects this promise with a readable message
    // instead of throwing uncaught and killing the process — log and continue, even at startup.
    const onListenError = (e) => reject(new Error(`[capture] failed to start on port ${port}: ${e.message}`));
    server.once('error', onListenError);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', onListenError);
      const actual = server.address().port;
      resolve({
        port: actual,
        url: `http://127.0.0.1:${actual}/`,
        requestFrame() { if (client && client.readyState === 1) client.send(JSON.stringify({ type: 'grab' })); },
        async stop() { try { wss.close(); } catch {} await new Promise((r) => server.close(r)); },
      });
    });
  });
}

module.exports = { startCaptureServer, validHighlight };
