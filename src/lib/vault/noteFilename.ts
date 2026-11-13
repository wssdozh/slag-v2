// ponytail: regex-санитизация под ограничения windows/unix без slug-библиотек; срез до 60 символов
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

/** Empty when nothing safe is left, so the caller can fall back to the id. */
function cleanStem(value: string): string {
  const withoutControls = Array.from(value, (char) => {
    const code = char.codePointAt(0) ?? 0;
    return code < 32 || code === 127 ? ' ' : char;
  }).join('');
  const clean = withoutControls
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 60)
    .trim();
  if (!clean || clean === '.' || clean === '..') return '';
  // CON.md is still the console device on Windows, so the stem itself has to move.
  return WINDOWS_RESERVED.test(clean) ? `_${clean}` : clean;
}

export function getSafeNoteFilename(title?: string, fallbackId: string = 'untitled'): string {
  const safe = cleanStem(title || '') || cleanStem(fallbackId) || 'untitled';
  return `${safe}.md`;
}

/**
 * The same title twice must not become the same file. The tail of the id is stable for a note,
 * so the name it gets once stays the name it gets every time.
 */
export function withIdSuffix(filename: string, id: string): string {
  const shortId = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(-8) || 'dup';
  return `${filename.replace(/\.md$/, '')} (${shortId}).md`;
}
