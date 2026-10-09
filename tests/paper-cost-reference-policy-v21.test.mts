import assert from 'node:assert/strict';
import test from 'node:test';

// Approved business rule (2026-10-09): supplier invoice 4379 was discounted.
// The reference pricing remains the prior, conservative box cost. Never
// replace it with the discounted invoice unit price or rewrite past events.
const referenceBoxCLP = 261_000;
const photosPerBox = 1_400;
const referencePhotoCLP = 186.4286;
const discountedPaperNetCLP = 2_623_548;
const discountedPaperPhotos = 16_800;
const invoiceTotalCLP = 3_200_000;

test('reference cost is the approved conservative 261000 CLP per box', () => {
  assert.equal(referenceBoxCLP, 261_000);
  assert.equal(photosPerBox, 1_400);
  assert.ok(Math.abs(referenceBoxCLP / photosPerBox - referencePhotoCLP) < 0.0001);
});

test('discounted purchase must not overwrite the higher reference', () => {
  assert.ok(discountedPaperNetCLP / discountedPaperPhotos < referencePhotoCLP);
  assert.equal(invoiceTotalCLP, 3_200_000);
});
