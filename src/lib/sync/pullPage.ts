/**
 * Pure pull-page policy: how big one page of the room feed may be, how long to wait for it, and
 * where the cursor goes after it. Kept out of the engine so the rules can be read and tested
 * without a websocket, a relay or a vault.
 */

import { SYNC_INTERVALS } from '../../config/sync.ts';

/** What one page of the feed has to say about the next request. */
export interface PullPageState {
  /** Cursor before this page. */
  previousCursor: number;
  /** Cursor after applying this page. */
  cursor: number;
  /** Bundles in the page, own rows excluded by the relay. */
  bundles: number;
  /** Highest `sync_id` in the room, or null when the relay did not say. */
  head: number | null;
  /** Bundles requested in this page. */
  pageSize: number;
}

export type PullStep = 'continue' | 'done' | 'stuck';

/**
 * The next move after a page.
 *
 * `done` is decided by the room's head, not by a short page: a page capped by weight can hold two
 * bundles while the feed still has forty, and stopping there left the laptop half-synced. The
 * head counts this device's own bundles too, which the relay never sends back, so an empty page
 * also ends the feed — otherwise the cursor sits forever one step behind its own last bundle.
 */
export function nextPullStep(state: PullPageState): PullStep {
  if (state.bundles === 0) return 'done';
  const reachedHead = state.head !== null && state.cursor >= state.head;
  const shortPage = state.head === null && state.bundles < state.pageSize;
  if (reachedHead || shortPage) return 'done';
  return state.cursor > state.previousCursor ? 'continue' : 'stuck';
}

/**
 * How long one page may take: the flat allowance plus the time its bytes need at the floor
 * bandwidth. A 2 MB page over a 40 KB/s link is fifty seconds of legitimate transfer, and the old
 * flat thirty-second deadline cut exactly that transfer off.
 */
export function pullDeadlineMs(pageBytes: number, flatTimeoutMs: number): number {
  const floorMs = Math.ceil((pageBytes / SYNC_INTERVALS.PULL_FLOOR_BYTES_PER_SECOND) * 1000);
  return flatTimeoutMs + floorMs;
}

/**
 * Halve the page after a timeout, down to the floor. A page that keeps timing out is not a dead
 * relay, it is a page that does not fit this link; asking for the same size again never converges.
 */
export function shrinkPullBudget(pageBytes: number): number {
  return Math.max(SYNC_INTERVALS.PULL_PAGE_MIN_BYTES, Math.floor(pageBytes / 2));
}

/** A timeout is a page too big for this link, not a dead relay. */
export function isPageTimeout(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}
