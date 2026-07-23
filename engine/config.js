'use strict';
// ~/.0latency/config.json loader. JSON, not TOML: the dependency budget is `ws` only,
// and Node parses JSON natively. Written by /0l:setup, read by everything else.
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULTS = {
  repos: [],
  deepgram_key: '',
  operator_label: 'Operator',
  creation: 'auto',
  execution: 'off',
  models: { events: 'sonnet', summary: 'sonnet' },
  caps: { events: 20, summary: 2 },
  idle_stop_min: 20,
  max_meeting_h: 3,
  port: 8788,
};
const REQUIRED = ['org', 'default_repo', 'notes_repo'];

function configPath() { return path.join(os.homedir(), '.0latency', 'config.json'); }

function loadConfig(file = configPath()) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); }
  catch { throw new Error(`no config at ${file} — run /0l:setup first`); }
  let user;
  try { user = JSON.parse(raw); }
  catch (e) { throw new Error(`config at ${file} is not valid JSON: ${e.message}`); }

  const cfg = Object.assign({}, structuredClone(DEFAULTS), user);
  cfg.models = Object.assign({}, DEFAULTS.models, user.models || {});
  cfg.caps = Object.assign({}, DEFAULTS.caps, user.caps || {});
  if (process.env.DEEPGRAM_API_KEY) cfg.deepgram_key = process.env.DEEPGRAM_API_KEY;

  const missing = REQUIRED.filter((k) => !cfg[k]);
  if (missing.length) throw new Error(`config missing required field(s): ${missing.join(', ')} — run /0l:setup`);
  return cfg;
}

module.exports = { loadConfig, configPath, DEFAULTS };
