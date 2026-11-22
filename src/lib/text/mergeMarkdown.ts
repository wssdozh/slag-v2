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

export function mergeMarkdown(base: string, local: string, head: string): string | undefined {
  if (local === head || base === head) return local;
  if (base === local) return head;
  const texts = [base, local, head];
  if (texts.some((text) => text.length > MAX_BYTES || encoder.encode(text).length > MAX_BYTES)) return;
  const [original, mine, theirs] = texts.map((text) => text.split('\n'));
  if ([original, mine, theirs].some((lines) => lines.length > MAX_LINES)) return;
  const a = uniqueIndices(original), b = uniqueIndices(mine), c = uniqueIndices(theirs);
  const output: string[] = [];
  let start = 0, from = 0, other = 0;
  const append = (end: number, to: number, through: number) => {
    if (equalRange(original, start, end, mine, from, to)) output.push(...theirs.slice(other, through));
    else if (equalRange(original, start, end, theirs, other, through) || equalRange(mine, from, to, theirs, other, through)) {
      output.push(...mine.slice(from, to));
    } else return false;
    return true;
  };
  for (const [index, line] of original.entries()) {
    const left = b.get(line) ?? -1, right = c.get(line) ?? -1;
    if (a.get(line) !== index || left < 0 || right < 0) continue;
    if (left < from || right < other || !append(index, left, right)) return;
    output.push(line);
    start = index + 1;
    from = left + 1;
    other = right + 1;
  }
  return append(original.length, mine.length, theirs.length) ? output.join('\n') : undefined;
}
