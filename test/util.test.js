'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { slugify, elapsedHHMMSS } = require('../engine/util');

test('slugify produces safe kebab slugs and never an empty string', () => {
  assert.strictEqual(slugify('Weekly Product Walkthrough!'), 'weekly-product-walkthrough');
  assert.strictEqual(slugify('***'), 'meeting');
  assert.ok(slugify('x'.repeat(100)).length <= 60);
});

test('elapsedHHMMSS formats and clamps negatives', () => {
  assert.strictEqual(elapsedHHMMSS(3723000), '01:02:03');
  assert.strictEqual(elapsedHHMMSS(-5), '00:00:00');
});
