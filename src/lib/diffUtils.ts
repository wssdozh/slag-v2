export interface WordChunk {
  text: string;
  type: 'normal' | 'removed' | 'added';
}

export interface SideBySideDiffRow {
  oldLineNum?: number;
  oldContent?: string;
  oldType: 'normal' | 'removed' | 'empty';
  oldWords?: WordChunk[];
  newLineNum?: number;
  newContent?: string;
  newType: 'normal' | 'added' | 'empty';
  newWords?: WordChunk[];
}

export interface DiffResult {
  rows: SideBySideDiffRow[];
  addedCount: number;
  removedCount: number;
}

export interface MetadataDiffItem {
  label: string;
  oldValue?: string;
  newValue?: string;
}

/**
 * Computes Longest Common Subsequence matrix for two arrays.
 */
function computeLCSMatrix(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (a[i] === b[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  return dp;
}

type EditOp =
  | { type: 'equal'; oldIndex: number; newIndex: number }
  | { type: 'remove'; oldIndex: number }
  | { type: 'add'; newIndex: number };

/**
 * Computes word-level diff between two replaced lines.
 */
export function computeLineWordDiff(
  oldStr = '',
  newStr = ''
): { oldChunks: WordChunk[]; newChunks: WordChunk[] } {
  const tokenRegex = /(\s+|[^\s\w]+|\w+)/gu;
  const oldTokens = oldStr.match(tokenRegex) || (oldStr ? [oldStr] : []);
  const newTokens = newStr.match(tokenRegex) || (newStr ? [newStr] : []);

  if (oldTokens.length === 0) {
    return {
      oldChunks: [],
      newChunks: [{ text: newStr, type: 'added' }],
    };
  }
  if (newTokens.length === 0) {
    return {
      oldChunks: [{ text: oldStr, type: 'removed' }],
      newChunks: [],
    };
  }

  if (oldTokens.length > 250 || newTokens.length > 250) {
    return {
      oldChunks: [{ text: oldStr, type: 'removed' }],
      newChunks: [{ text: newStr, type: 'added' }],
    };
  }

  const dp = computeLCSMatrix(oldTokens, newTokens);
  let i = oldTokens.length;
  let j = newTokens.length;
  const oldChunks: WordChunk[] = [];
  const newChunks: WordChunk[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
      oldChunks.push({ text: oldTokens[i - 1], type: 'normal' });
      newChunks.push({ text: newTokens[j - 1], type: 'normal' });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      newChunks.push({ text: newTokens[j - 1], type: 'added' });
      j--;
    } else if (i > 0) {
      oldChunks.push({ text: oldTokens[i - 1], type: 'removed' });
      i--;
    }
  }

  oldChunks.reverse();
  newChunks.reverse();

  return { oldChunks, newChunks };
}

/**
 * Generates aligned Side-by-Side Diff rows using LCS.
 */
export function computeSideBySideDiff(oldText = '', newText = ''): DiffResult {
  const normOld = oldText.replace(/\r\n/g, '\n');
  const normNew = newText.replace(/\r\n/g, '\n');

  const oldLines = normOld ? normOld.split('\n') : [];
  const newLines = normNew ? normNew.split('\n') : [];

  if (oldLines.length === 0 && newLines.length === 0) {
    return { rows: [], addedCount: 0, removedCount: 0 };
  }

  const dp = computeLCSMatrix(oldLines, newLines);

  let i = oldLines.length;
  let j = newLines.length;
  const ops: EditOp[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.push({ type: 'equal', oldIndex: i - 1, newIndex: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: 'add', newIndex: j - 1 });
      j--;
    } else if (i > 0) {
      ops.push({ type: 'remove', oldIndex: i - 1 });
      i--;
    }
  }

  ops.reverse();

  const rows: SideBySideDiffRow[] = [];
  let addedCount = 0;
  let removedCount = 0;

  let k = 0;
  while (k < ops.length) {
    const op = ops[k];

    if (op.type === 'equal') {
      rows.push({
        oldLineNum: op.oldIndex + 1,
        oldContent: oldLines[op.oldIndex],
        oldType: 'normal',
        oldWords: [{ text: oldLines[op.oldIndex], type: 'normal' }],
        newLineNum: op.newIndex + 1,
        newContent: newLines[op.newIndex],
        newType: 'normal',
        newWords: [{ text: newLines[op.newIndex], type: 'normal' }],
      });
      k++;
    } else {
      const removes: number[] = [];
      const adds: number[] = [];

      while (k < ops.length && (ops[k].type === 'remove' || ops[k].type === 'add')) {
        const cur = ops[k];
        if (cur.type === 'remove') removes.push(cur.oldIndex);
        else if (cur.type === 'add') adds.push(cur.newIndex);
        k++;
      }

      removedCount += removes.length;
      addedCount += adds.length;

      const maxLen = Math.max(removes.length, adds.length);
      for (let r = 0; r < maxLen; r++) {
        const hasOld = r < removes.length;
        const hasNew = r < adds.length;

        if (hasOld && hasNew) {
          const { oldChunks, newChunks } = computeLineWordDiff(
            oldLines[removes[r]],
            newLines[adds[r]]
          );
          rows.push({
            oldLineNum: removes[r] + 1,
            oldContent: oldLines[removes[r]],
            oldType: 'removed',
            oldWords: oldChunks,
            newLineNum: adds[r] + 1,
            newContent: newLines[adds[r]],
            newType: 'added',
            newWords: newChunks,
          });
        } else if (hasOld) {
          rows.push({
            oldLineNum: removes[r] + 1,
            oldContent: oldLines[removes[r]],
            oldType: 'removed',
            oldWords: [{ text: oldLines[removes[r]], type: 'removed' }],
            newLineNum: undefined,
            newContent: undefined,
            newType: 'empty',
            newWords: [],
          });
        } else {
          rows.push({
            oldLineNum: undefined,
            oldContent: undefined,
            oldType: 'empty',
            oldWords: [],
            newLineNum: adds[r] + 1,
            newContent: newLines[adds[r]],
            newType: 'added',
            newWords: [{ text: newLines[adds[r]], type: 'added' }],
          });
        }
      }
    }
  }

  return { rows, addedCount, removedCount };
}

/**
 * Computes human-readable metadata differences between two versions of an item.
 */
export function computeMetadataDiff(
  oldItem?: { folder?: string; dueDate?: string; priority?: string; tags?: string[]; title?: string },
  newItem?: { folder?: string; dueDate?: string; priority?: string; tags?: string[]; title?: string }
): MetadataDiffItem[] {
  const diffs: MetadataDiffItem[] = [];
  if (!oldItem || !newItem) return diffs;

  if (newItem.title && oldItem.title !== newItem.title) {
    diffs.push({ label: 'Заголовок', oldValue: oldItem.title, newValue: newItem.title });
  }
  if (newItem.folder !== undefined && oldItem.folder !== newItem.folder) {
    diffs.push({ label: 'Папка', oldValue: oldItem.folder || 'Входящие', newValue: newItem.folder || 'Входящие' });
  }
  if (newItem.dueDate !== undefined && oldItem.dueDate !== newItem.dueDate) {
    diffs.push({ label: 'Срок', oldValue: oldItem.dueDate || 'без срока', newValue: newItem.dueDate || 'без срока' });
  }
  if (newItem.priority !== undefined && oldItem.priority !== newItem.priority) {
    diffs.push({ label: 'Приоритет', oldValue: oldItem.priority || 'нет', newValue: newItem.priority || 'нет' });
  }
  const oldTags = (oldItem.tags || []).join(', ');
  const newTags = (newItem.tags || []).join(', ');
  if (newItem.tags !== undefined && oldTags !== newTags) {
    diffs.push({ label: 'Теги', oldValue: oldTags || 'нет', newValue: newTags || 'нет' });
  }

  return diffs;
}
