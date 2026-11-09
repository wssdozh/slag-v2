import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCorpus, snapshot, summarise } from './common.mjs';
import { searchFallback } from './fallback.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};

const corpusPath = resolve(arg('corpus', `${__dirname}/../.data/corpus-10000.jsonl`));
const queriesPath = resolve(arg('queries', `${__dirname}/../.data/queries-10000.json`));
const outPath = resolve(arg('out', `${__dirname}/../out/orama.json`));
const limitPerTemplate = Number(arg('limit-per-template', 0));
const language = arg('language', 'english');
const noFallback = process.argv.includes('--no-fallback');

const { create, insertMultiple, search } = await import('@orama/orama');

const docs = await loadCorpus(corpusPath);
const loaded = snapshot();

const t0 = performance.now();
const db = await create({
  language,
  schema: {
    id: 'string',
    type: 'string',
    title: 'string',
    content: 'string',
    tags: 'string[]',
    folder: 'string',
  },
});
await insertMultiple(db, docs);
const buildMs = +(performance.now() - t0).toFixed(1);
const built = snapshot();

const { queries: allQueries } = JSON.parse(readFileSync(queriesPath, 'utf8'));
const only = arg('templates', '');
const wanted = only ? new Set(only.split(',')) : null;
const queries = (limitPerTemplate > 0
  ? Object.values(
      allQueries.reduce((acc, q) => {
        acc[q.template] ||= [];
        if (acc[q.template].length < limitPerTemplate) acc[q.template].push(q);
        return acc;
      }, {})
    ).flat()
  : allQueries
).filter((q) => !wanted || wanted.has(q.template));

const perTemplate = {};
let fellThrough = 0;
let oramaHits = 0;
let totalMs = 0;

let done = 0;
for (const q of queries) {
  const start = performance.now();
  let hits = [];
  try {
    const phrase = await search(db, { term: q.text, tolerance: 1, limit: 15 });
    hits = phrase.hits;
    if (hits.length === 0 && q.tokens.length > 1) {
      const ids = new Set();
      for (const kw of q.tokens) {
        const r = await search(db, { term: kw, tolerance: 1, limit: 10 });
        r.hits.forEach((h) => ids.add(h.document.id));
      }
      hits = [...ids].map((id) => ({ document: { id } }));
    }
  } catch (err) {
    console.error('orama query failed:', q.text, err.message);
  }
  if (hits.length === 0) {
    fellThrough++;
    if (!noFallback) {
      // The app pays this on top of Orama when the index returns nothing.
      const fb = searchFallback(docs, q.text);
      hits = fb.map((d) => ({ document: d }));
    }
  } else {
    oramaHits++;
  }

  const ms = performance.now() - start;
  totalMs += ms;
  perTemplate[q.template] ||= { latencies: [], hits: [] };
  perTemplate[q.template].latencies.push(ms);
  perTemplate[q.template].hits.push(hits.length);

  if (++done % 10 === 0) {
    console.error(`[${done}/${queries.length}] ${(totalMs / done).toFixed(0)} ms/query avg`);
  }
}

const summary = {};
for (const [template, data] of Object.entries(perTemplate)) {
  summary[template] = {
    ...summarise(data.latencies),
    avgHits: +(data.hits.reduce((a, b) => a + b, 0) / data.hits.length).toFixed(1),
  };
}

const result = {
  engine: `orama-${language}${noFallback ? '-clean' : ''}`,
  language,
  mode: noFallback ? 'engine-only' : 'app-path',
  docs: docs.length,
  buildMs,
  mem: { load: loaded, built },
  queries: queries.length,
  queryTotalMs: +totalMs.toFixed(0),
  oramaHitQueries: oramaHits,
  fellThroughToFallback: fellThrough,
  templates: summary,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
