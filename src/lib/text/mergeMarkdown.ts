// Merge exact, independent Markdown edits; never guess alignment for repeated lines.
const MAX_LINES = 8_000;
const MAX_BYTES = 256 * 1024;
const encoder = new TextEncoder();

function uniqueIndices(lines: string[]): Map<string, number> {
  const indices = new Map<string, number>();
  lines.forEach((line, index) => {
    if (line.trim()) indices.set(line, indices.has(line) ? -1 : index);
  });
  return indices;
}

function equalRange(a: string[], start: number, end: number, b: string[], from: number, to: number): boolean {
  if (end - start !== to - from) return false;
  for (let i = start, j = from; i < end; i++, j++) if (a[i] !== b[j]) return false;
  return true;
}

function startsFence(line: string): boolean {
  const marker = /[ \t]*(>|(?:[-+*]|\d{1,9}[.)])[ \t]+|`{3,}|~{3,})/y;
  for (let match; (match = marker.exec(line));) {
    if (match[1].startsWith('`') || match[1].startsWith('~')) return true;
  }
  return false;
}

function plainUniqueLines(lines: string[]): boolean {
  const seen = new Set<string>();
  for (const line of lines) {
    if (/^[ \t]*$/.test(line)) continue;
    if (!plainLine(line) || seen.has(line)) return false;
    seen.add(line);
  }
  return true;
}

function plainLine(line: string): boolean {
  return /^[\p{L}\p{M}\p{N}«“"'(][\p{L}\p{M}\p{N} ,.!?:;…«»„“”"'’()–—-]*$/u.test(line)
    && !/^\d{1,9}[.)](?: |$)| {2}$/.test(line);
}

function commonEdges(base: string[], result: string[]) {
  let start = 0, suffix = 0;
  const limit = Math.min(base.length, result.length);
  while (start < limit && base[start] === result[start]) start++;
  while (suffix < limit && base[base.length - 1 - suffix] === result[result.length - 1 - suffix]) suffix++;
  return { start, suffix, limit };
}

// One unambiguously anchored contiguous replacement per side; no general alignment or LCS.
function replacement(base: string[], result: string[]) {
  const { start, suffix, limit } = commonEdges(base, result);
  if (start + suffix >= limit) return;
  const end = base.length - suffix;
  const insert = result.slice(start, result.length - suffix);
  if (!base.slice(start, end).every(plainLine) || !insert.every(plainLine)) return;
  const original = new Set(base);
  if (insert.some((line) => original.has(line))) return; // Possible move or duplicate.
  return { start, end, insert };
}

function mergeAdjacent(base: string[], local: string[], head: string[]): string[] | undefined {
  if (![base, local, head].every(plainUniqueLines)) return;
  const mine = replacement(base, local), theirs = replacement(base, head);
  if (!mine || !theirs) return;
  const [first, second] = mine.start < theirs.start ? [mine, theirs] : [theirs, mine];
  if (first.end > second.start) return;
  return [...base.slice(0, first.start), ...first.insert, ...base.slice(first.end, second.start), ...second.insert, ...base.slice(second.end)];
}

export function mergeMarkdown(base: string, local: string, head: string): string | undefined {
  if (local === head || base === head) return local;
  if (base === local) return head;
  const texts = [base, local, head];
  if (texts.some((text) => text.length > MAX_BYTES || encoder.encode(text).length > MAX_BYTES)) return;
  const [original, mine, theirs] = texts.map((text) => text.split('\n'));
  if ([original, mine, theirs].some((lines) => lines.length > MAX_LINES)) return;
  const a = uniqueIndices(original), b = uniqueIndices(mine), c = uniqueIndices(theirs);
  const fences = new Set([...original, ...mine, ...theirs].filter(startsFence));
  const output: string[] = [];
  let start = 0, from = 0, other = 0;
  const append = (end: number, to: number, through: number) => {
    const localUnchanged = equalRange(original, start, end, mine, from, to);
    const remoteUnchanged = equalRange(original, start, end, theirs, other, through);
    const localPart = mine.slice(from, to), remotePart = theirs.slice(other, through);
    if (localUnchanged && remoteUnchanged) {
      output.push(...localPart);
      return true;
    }
    const basePart = original.slice(start, end);
    // Don't anchor on a movable delimiter. Compare the remaining changes after trimming exact edges.
    const touchesFence = (part: string[]) => {
      const { start, suffix, limit } = commonEdges(basePart, part);
      // Overlapping equal edges make the position of a repeated line ambiguous.
      const from = Math.min(start, limit - suffix), tail = Math.min(suffix, limit - start);
      return [basePart, part].some((lines) => lines.slice(from, lines.length - tail).some((line) => fences.has(line)));
    };
    if (fences.size && ((!localUnchanged && touchesFence(localPart)) || (!remoteUnchanged && touchesFence(remotePart)))) return false;
    if (localUnchanged) output.push(...remotePart);
    else if (remoteUnchanged || equalRange(mine, from, to, theirs, other, through)) output.push(...localPart);
    else {
      // ponytail: the fallback is for prose, not for edits inside or around code blocks.
      const adjacent = !fences.size && mergeAdjacent(basePart, localPart, remotePart);
      if (!adjacent) return false;
      output.push(...adjacent);
    }
    return true;
  };
  for (const [index, line] of original.entries()) {
    const left = b.get(line) ?? -1, right = c.get(line) ?? -1;
    if (a.get(line) !== index || left < 0 || right < 0 || fences.has(line)) continue;
    if (left < from || right < other || !append(index, left, right)) return;
    output.push(line);
    start = index + 1;
    from = left + 1;
    other = right + 1;
  }
  return append(original.length, mine.length, theirs.length) ? output.join('\n') : undefined;
}
