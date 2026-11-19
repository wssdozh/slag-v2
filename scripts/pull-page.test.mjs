// The pull pagination policy: how a page ends, how long it may take, and how it shrinks.
import assert from 'node:assert/strict';
import test from 'node:test';
import { SYNC_INTERVALS } from '../src/config/sync.ts';
import { isPageTimeout, nextPullStep, pullDeadlineMs, shrinkPullBudget } from '../src/lib/sync/pullPage.ts';

/** One page as the engine saw it. */
function page(overrides = {}) {
  return { previousCursor: 0, cursor: 10, bundles: 2, head: 10, pageSize: 100, ...overrides };
}

test('a short page is not the end of the feed when the head is further on', () => {
  // The registry: a byte budget fits two bundles out of forty. Stopping here left the laptop
  // half-synced with a clean status.
  assert.equal(nextPullStep(page({ cursor: 10, bundles: 2, head: 40 })), 'continue');
});

test('the head ends the feed', () => {
  assert.equal(nextPullStep(page({ cursor: 40, head: 40 })), 'done');
  assert.equal(nextPullStep(page({ cursor: 41, head: 40 })), 'done');
});

test('an empty page ends the feed even when our own bundle holds the head', () => {
  // The relay never sends this device its own rows back, so cursor can sit one step behind head.
  assert.equal(nextPullStep(page({ cursor: 10, bundles: 0, head: 12 })), 'done');
});

test('without a head the page size still has to say something', () => {
  assert.equal(nextPullStep(page({ head: null, bundles: 100, pageSize: 100 })), 'continue');
  assert.equal(nextPullStep(page({ head: null, bundles: 3, pageSize: 100 })), 'done');
});

test('a page that did not move the cursor is stuck, not done', () => {
  assert.equal(nextPullStep(page({ previousCursor: 10, cursor: 10, bundles: 5, head: 40 })), 'stuck');
});

test('the deadline is sized by bytes at the floor bandwidth', () => {
  assert.equal(pullDeadlineMs(2_000_000, 60_000), 110_000);
  assert.equal(pullDeadlineMs(SYNC_INTERVALS.PULL_PAGE_MIN_BYTES, 60_000), 66_250);
  assert.equal(pullDeadlineMs(0, 60_000), 60_000);
});

test('a timed-out page halves down to the floor and no further', () => {
  assert.equal(shrinkPullBudget(2_000_000), 1_000_000);
  assert.equal(shrinkPullBudget(500_000), 250_000);
  assert.equal(shrinkPullBudget(SYNC_INTERVALS.PULL_PAGE_MIN_BYTES), SYNC_INTERVALS.PULL_PAGE_MIN_BYTES);
});

test('only a timeout counts as a page too big, not a relay error', () => {
  assert.equal(isPageTimeout({ name: 'TimeoutError' }), true);
  assert.equal(isPageTimeout({ name: 'AbortError' }), true);
  assert.equal(isPageTimeout({ name: 'TypeError' }), false);
  assert.equal(isPageTimeout(null), false);
  assert.equal(isPageTimeout(undefined), false);
});
