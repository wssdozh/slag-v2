import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadCorpus, snapshot } from './common.mjs';
const { create, insertMultiple, search } = await import('@orama/orama');

const corpusPath = process.argv[2] ?? fileURLToPath(new URL('../.data/corpus-10000.jsonl', import.meta.url));
const queriesPath = process.argv[3] ?? fileURLToPath(new URL('../.data/queries-10000.json', import.meta.url));

const docs = await loadCorpus(corpusPath);
const queries = JSON.parse(readFileSync(queriesPath, 'utf8')).queries;
const pickOne = (t) => queries.find((q) => q.template === t);

const db = await create({
  language: 'russian',
  schema: { id: 'string', type: 'string', title: 'string', content: 'string', tags: 'string[]', folder: 'string' },
});
await insertMultiple(db, docs);
console.log('build done, heap', snapshot().heapMB, 'MB');

async function time(label, term, opts) {
  const t = performance.now();
  const r = await search(db, { term, limit: 15, ...opts });
  console.log(`${label.padEnd(42)} ${(performance.now() - t).toFixed(1)} ms, hits ${r.hits.length}`);
}

const single = pickOne('single');
const phrase = pickOne('phrase');
const and3 = pickOne('and3');
const typo = pickOne('typo');

await time('single, tolerance 1', single.text, { tolerance: 1 });
await time('single, tolerance 0', single.text, { tolerance: 0 });
await time('phrase, tolerance 1', phrase.text, { tolerance: 1 });
await time('phrase, tolerance 0', phrase.text, { tolerance: 0 });
await time('and3, tolerance 1', and3.text, { tolerance: 1 });
await time('and3, tolerance 0', and3.text, { tolerance: 0 });
await time('typo, tolerance 1', typo.text, { tolerance: 1 });
await time('typo, tolerance 0', typo.text, { tolerance: 0 });
