'use strict';
// Pilot preflight for the plugin: verify what a MEETING actually needs, before the meeting.
// (The 0latency repo's preflight checks the legacy orchestrator; this one checks the plugin.)
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { loadConfig } = require('./config');

function execP(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { shell: process.platform === 'win32', timeout: 15000 }, (err, stdout, stderr) =>
      resolve({ ok: !err, out: String(stdout || stderr || (err && err.message) || '').trim() }));
  });
}

function defaultWssProbe() {
  return new Promise((resolve) => {
    let WebSocket;
    try { WebSocket = require('ws'); } catch { return resolve(false); }
    const sock = new WebSocket('wss://api.deepgram.com/v1/listen', { headers: { Authorization: 'Token probe' }, handshakeTimeout: 10000 });
    const done = (v) => { try { sock.terminate(); } catch {} resolve(v); };
    // ANY websocket-level response (open or a 401 rejection) proves the network path works;
    // a proxy/firewall block surfaces as a socket error or timeout.
    sock.on('open', () => done(true));
    sock.on('unexpected-response', () => done(true));
    sock.on('error', (e) => done(/40[13]/.test(e.message)));
    setTimeout(() => done(false), 11000);
  });
}

function defaultPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

function defaultFindBrowser() {
  const candidates = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app', '/Applications/Chromium.app', '/Applications/Microsoft Edge.app']
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

async function defaultNotesCloneOk(cfg) {
  const dir = path.join(os.homedir(), '.0latency', 'notes', cfg.notes_repo.split('/')[1] || 'notes');
  if (!fs.existsSync(path.join(dir, '.git'))) return false;
  const r = await execP('git', ['-C', dir, 'push', '--dry-run']);
  return r.ok;
}

async function runChecks(deps = {}) {
  const d = Object.assign({
    nodeVersion: process.version,
    resolveWs: () => { try { require.resolve('ws'); return true; } catch { return false; } },
    loadCfg: () => loadConfig(),
    fetchFn: (url, opts) => fetch(url, opts),
    wssProbe: defaultWssProbe,
    exec: execP,
    notesCloneOk: defaultNotesCloneOk,
    portFree: defaultPortFree,
    findBrowser: defaultFindBrowser,
    log: console,
  }, deps);

  const results = [];
  const rec = (name, ok, detail = '') => { results.push({ name, ok, detail }); d.log.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

  const major = parseInt(String(d.nodeVersion).replace(/^v/, ''), 10);
  rec('Node >= 20', major >= 20, d.nodeVersion);
  rec('ws installed', d.resolveWs(), '');

  let cfg = null;
  try { cfg = d.loadCfg(); rec('config', true, ''); }
  catch (e) { rec('config', false, e.message); }

  if (cfg) {
    try {
      const res = await d.fetchFn('https://api.deepgram.com/v1/projects', { headers: { Authorization: `Token ${cfg.deepgram_key}` }, signal: AbortSignal.timeout(10000) });
      rec('Deepgram key', !!res.ok, res.ok ? 'authenticated' : `HTTP ${res.status}`);
    } catch (e) { rec('Deepgram key', false, e.message); }
    rec('Deepgram WSS reachable', await d.wssProbe(), 'if FAIL: corporate proxy/firewall likely blocks raw WebSockets — request an exception for api.deepgram.com');
    const claude = await d.exec('claude', ['--version']);
    rec('claude CLI', claude.ok, claude.out.split('\n')[0]);
    const auth = await d.exec('gh', ['auth', 'status']);
    rec('gh auth', auth.ok, auth.ok ? '' : auth.out.split('\n')[0]);
    const probe = await d.exec('gh', ['issue', 'list', '-R', cfg.default_repo, '-L', '1']);
    rec(`gh access to ${cfg.default_repo}`, probe.ok, probe.ok ? '' : probe.out.split('\n')[0]);
    rec('notes repo clone + push access', await d.notesCloneOk(cfg), 'run /0l:setup if missing');
    rec(`port ${cfg.port} free`, await d.portFree(cfg.port), '');
  }

  const browser = d.findBrowser();
  if (browser) rec('Chromium-family browser', true, browser);
  else d.log.log('  WARN  no Chromium-family browser found — tab-audio capture needs Chrome/Chromium/Edge (warning only)');

  const ok = results.every((r) => r.ok);
  d.log.log(ok ? '\n[0l preflight] all checks passed — clear for the meeting.' : '\n[0l preflight] FAILURES above — fix before the meeting.');
  return { ok, results };
}

if (require.main === module) runChecks().then((r) => process.exit(r.ok ? 0 : 1));
module.exports = { runChecks };
