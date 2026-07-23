'use strict';
// Per-category spawn budgets (design: replace the single silent LLM_CAP with split,
// VISIBLY-warning caps). File-backed so an engine restart mid-meeting keeps counts.
const fs = require('fs');
const path = require('path');

function createCaps(stateDir, budgets, log = console) {
  fs.mkdirSync(stateDir, { recursive: true });
  const file = (cat, suffix = '') => path.join(stateDir, `cap_${cat}${suffix}`);
  const used = (cat) => { try { return parseInt(fs.readFileSync(file(cat), 'utf8'), 10) || 0; } catch { return 0; } };
  const onceMarker = (cat, kind) => {
    const p = file(cat, `.${kind}`);
    if (fs.existsSync(p)) return false;
    fs.writeFileSync(p, '1');
    return true;
  };
  function take(cat) {
    const budget = budgets[cat];
    if (budget == null) { log.error(`[0l] caps: unknown category "${cat}" — refusing`); return false; }
    const n = used(cat);
    if (n >= budget) {
      if (onceMarker(cat, 'cap')) log.log(`[0l] CAP reached for ${cat} (${budget}) — further ${cat} calls are skipped this meeting`);
      return false;
    }
    const next = n + 1;
    fs.writeFileSync(file(cat), String(next));
    if (next >= Math.ceil(budget * 0.8) && next < budget && onceMarker(cat, 'warn')) {
      log.log(`[0l] WARN ${cat} calls at 80% of budget (${next}/${budget})`);
    }
    return true;
  }
  return { take, used };
}

module.exports = { createCaps };
