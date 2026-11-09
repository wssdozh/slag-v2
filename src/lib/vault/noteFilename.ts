// ponytail: regex-санитизация под ограничения windows/unix без slug-библиотек; срез до 60 символов
export function getSafeNoteFilename(title?: string, fallbackId: string = 'untitled'): string {
  const clean = (title || '')
    .trim()
    .replace(/[\\/:*?"<>|\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const safe = clean.slice(0, 60).trim();
  return `${safe || fallbackId}.md`;
}

/**
 * The same title twice must not become the same file. The tail of the id is stable for a note,
 * so the name it gets once stays the name it gets every time.
 */
export function withIdSuffix(filename: string, id: string): string {
  const shortId = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(-8) || 'dup';
  return `${filename.replace(/\.md$/, '')} (${shortId}).md`;
}
