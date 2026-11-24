import { noteReviewKind } from './notes/review';
import type { NoteConflict } from './notes/journal';

type ReviewQueue = { readonly conflicts?: readonly NoteConflict[] } & ({ readonly pendingCount: number } | { readonly pending: readonly unknown[] });

export function reviewCounts(queue: ReviewQueue) {
  const counts = { registryPending: 'pendingCount' in queue ? queue.pendingCount : queue.pending.length, legacyReviews: 0, reviews: 0, conflicts: 0 };
  for (const { fields } of queue.conflicts ?? []) {
    const kind = noteReviewKind(fields);
    if (kind === 'legacy') counts.legacyReviews++;
    else if (kind === 'review') counts.reviews++;
    else counts.conflicts++;
  }
  return counts;
}
