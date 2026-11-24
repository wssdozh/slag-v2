import { useState } from 'react';
import { syncEngine } from '../../../lib/sync/syncEngine';
import { reviewedRevisions, reviewKey, type ReviewEntry } from './helpers';

export function useSyncConflicts() {
  const groups = new Map<string, ReviewEntry[]>();
  for (const entry of syncEngine.getNoteConflicts()) {
    const key = reviewKey(entry);
    const members = groups.get(key);
    if (members) members.push(entry);
    else groups.set(key, [entry]);
  }
  const [review, setReview] = useState<{ key: string; revisions: Record<string, number> }>();
  const [decision, setDecision] = useState<'keep' | 'retry' | 'close'>();
  const [draft, setDraft] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [resolving, setResolving] = useState(false);
  const entries = review ? groups.get(review.key) ?? [] : [];
  const changed = Boolean(review && entries.some(({ noteId, currentRevision }) => review.revisions[noteId] !== currentRevision));
  const start = (members: ReviewEntry[]) => {
    setReview({ key: reviewKey(members[0]), revisions: reviewedRevisions(members) });
    setDecision(undefined); setError(''); setDraft(undefined); setSelected([]);
  };
  const dismiss = () => { setReview(undefined); setDraft(undefined); setDecision(undefined); setError(''); setSelected([]); };
  const close = () => {
    if (resolving) return;
    if (draft !== undefined) setDecision('close');
    else dismiss();
  };
  const confirm = async (selective: boolean) => {
    if (decision === 'close') { dismiss(); return; }
    if (!review || !decision || resolving || changed || !entries.length) return;
    const [entry] = entries;
    setResolving(true);
    try {
      if (entry.folderGroup) await syncEngine.resolveFolderConflict(entry.folderGroup.id, decision, review.revisions);
      else await syncEngine.resolveNoteConflict(entry.intentId, decision, review.revisions[entry.noteId],
        decision === 'retry' ? draft : undefined, decision === 'retry' && selective ? selected : undefined);
      dismiss();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось применить решение');
      setDecision(undefined);
    } finally { setResolving(false); }
  };
  const refresh = () => {
    if (!review || !entries.length) return;
    setReview({ ...review, revisions: reviewedRevisions(entries) });
    setDecision(undefined); setError(''); setSelected([]);
  };
  return { groups: [...groups.values()], entries, start, refresh, close, decision, setDecision, draft, setDraft,
    selected, setSelected, changed, error, resolving, confirm };
}
