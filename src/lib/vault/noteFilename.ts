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
