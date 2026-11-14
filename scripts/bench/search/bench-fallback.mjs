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
const outPath = resolve(arg('out', `${__dirname}/../out/fallback.json`));
const limitPerTemplate = Number(arg('limit-per-template', 1));

const docs = await loadCorpus(corpusPath);
const loaded = snapshot();

const { queries: allQueries } = JSON.parse(readFileSync(queriesPath, 'utf8'));
const only = arg('templates', '');
const wanted = only ? new Set(only.split(',')) : null;
const queries = Object.values(
  allQueries.reduce((acc, q) => {
    acc[q.template] ||= [];
    if (acc[q.template].length < limitPerTemplate) acc[q.template].push(q);
    return acc;
  }, {})
)
  .flat()
  .filter((q) => !wanted || wanted.has(q.template));

const perTemplate = {};
let totalMs = 0;

// Warm the JIT on a couple of queries so the first sample is not dominated by compilation.
for (const q of queries.slice(0, 2)) searchFallback(docs, q.text);

for (const q of queries) {
  const start = performance.now();
  const hits = searchFallback(docs, q.text);
  const ms = performance.now() - start;
  totalMs += ms;
  perTemplate[q.template] ||= { latencies: [], hits: [] };
  perTemplate[q.template].latencies.push(ms);
  perTemplate[q.template].hits.push(hits.length);
}

const summary = {};
for (const [template, data] of Object.entries(perTemplate)) {
  summary[template] = {
    ...summarise(data.latencies),
    avgHits: +(data.hits.reduce((a, b) => a + b, 0) / data.hits.length).toFixed(1),
  };
}

const result = {
  engine: 'fallback',
  docs: docs.length,
  buildMs: 0,
  mem: { load: loaded, built: snapshot() },
  queries: queries.length,
  queryTotalMs: +totalMs.toFixed(0),
  note: 'linear full-corpus scan, faithful copy of Level C in searchService.ts',
  templates: summary,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
