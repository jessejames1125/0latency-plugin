'use strict';
// Stage-1 zero-cost lexical gate, copied verbatim from 0latency pipeline/actions.js
// (mtgd §6.7 rules). Filters utterances before any claude spawn is considered.

// Ships exactly as (mtgd §6.7).
const LEXICON = new Set(('decide cut ship move fix drop add remove rename merge split block unblock ' +
  'assign schedule delay prioritize deprecate adopt switch revert refactor delete create postpone').split(' '));

// 50-word standard stop list, inline (mtgd §6.7).
const STOPWORDS = new Set(('the a an and or but if then else of to in on at for from by with as is are was were ' +
  'be been being it its this that these those we you they he she i me my our your their them his her ' +
  'do does did done will would can could should may might must not no yes just about into over').split(' '));

const tokenize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);

// Stage 1: ≥4 tokens, not ending in ?, a lexicon verb (whole word) followed within 6 tokens by
// any non-stopword. Cheap, deterministic, no LLM.
function isCandidate(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed || trimmed.endsWith('?')) return false;
  const tokens = tokenize(trimmed);
  if (tokens.length < 4) return false;
  for (let i = 0; i < tokens.length; i++) {
    if (!LEXICON.has(tokens[i])) continue;
    for (let j = i + 1; j <= i + 6 && j < tokens.length; j++) {
      if (!STOPWORDS.has(tokens[j])) return true;
    }
  }
  return false;
}

module.exports = { isCandidate, tokenize, LEXICON, STOPWORDS };
