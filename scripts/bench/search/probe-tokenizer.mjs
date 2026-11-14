// Minimal reproduction of the Cyrillic indexing bug in the app's search setup.
// `create()` in src/lib/searchService.ts passes no `language`, so Orama falls back
// to its english tokenizer, whose splitter regex is [^A-Za-z0-9_'-]+. Cyrillic
// characters are treated as separators, the whole field tokenizes to nothing,
// and every Russian query misses the index.
import { create, insert, search } from '@orama/orama';

const doc = { id: '1', title: 'Заметка про поиск', content: 'архив данных и тесты' };

async function run(label, options) {
  const db = await create({ schema: { id: 'string', title: 'string', content: 'string' }, ...options });
  await insert(db, doc);
  const hits = [];
  for (const term of ['заметка', 'поиск', 'архив']) {
    const r = await search(db, { term, tolerance: 1, limit: 5 });
    hits.push(`${term}:${r.hits.length}`);
  }
  console.log(
    `${label.padEnd(24)} title tokens: ${String(db.data.index.fieldLengths.content?.['1']).padEnd(2)} | ${hits.join(' ')}`
  );
}

await run('default (english)', {});
await run('language: russian', { language: 'russian' });
