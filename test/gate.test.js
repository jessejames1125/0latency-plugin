'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { isCandidate } = require('../engine/gate');

test('imperative decisions pass the gate', () => {
  assert.ok(isCandidate('let us fix the broken export button on invoices'));
  assert.ok(isCandidate('we should rename the settings page to preferences'));
});

test('questions and short lines are rejected', () => {
  assert.ok(!isCandidate('should we fix the export button?'));
  assert.ok(!isCandidate('fix it now'));
  assert.ok(!isCandidate('that is interesting to me'));
});
