import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { loadCorpus, snapshot, summarise } from './common.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};

const corpusPath = resolve(arg('corpus', `${__dirname}/../.data/corpus-10000.jsonl`));
const queriesPath = resolve(arg('queries', `${__dirname}/../.data/queries-10000.json`));
const outPath = resolve(arg('out', `${__dirname}/../out/fts5.json`));
const limitPerTemplate = Number(arg('limit-per-template', 0));

const docs = await loadCorpus(corpusPath);
const loaded = snapshot();

const t0 = performance.now();
const db = new DatabaseSync(':memory:');
db.exec(`CREATE VIRTUAL TABLE notes USING fts5(
  id UNINDEXED,
  title,
  content,
  tags,
  folder,
  tokenize='unicode61 remove_diacritics 2'
)`);
const insert = db.prepare('INSERT INTO notes (id, title, content, tags, folder) VALUES (?, ?, ?, ?, ?)');
db.exec('BEGIN');
for (const d of docs) insert.run(d.id, d.title, d.content, d.tags.join(' '), d.folder);
db.exec('COMMIT');
db.exec('ANALYZE');
const buildMs = +(performance.now() - t0).toFixed(1);
const built = snapshot();

// bm25(notes, id, title, content, tags, folder) — lower is better.
const stmt = db.prepare(
  'SELECT id, bm25(notes, 0.0, 5.0, 1.0, 3.0, 2.0) AS score FROM notes WHERE notes MATCH ? ORDER BY score LIMIT 15'
);

function matchExpr(q) {
  const toks = q.tokens.filter(Boolean).map((t) => `"${t.replace(/"/g, '""')}"`);
  if (q.tag) return `tags : ${toks[0]}`;
  if (q.prefix) return `${q.tokens[0]}*`;
  if (q.template === 'phrase') return toks.join(' ');
  if (q.template === 'and3' || q.template === 'long') return toks.join(' AND ');
  return toks[0];
}

const { queries: allQueries } = JSON.parse(readFileSync(queriesPath, 'utf8'));
const queries = limitPerTemplate > 0
  ? Object.values(
      allQueries.reduce((acc, q) => {
        acc[q.template] ||= [];
        if (acc[q.template].length < limitPerTemplate) acc[q.template].push(q);
        return acc;
      }, {})
    ).flat()
  : allQueries;

const perTemplate = {};
let totalMs = 0;

for (const q of queries) {
  const expr = matchExpr(q);
  const start = performance.now();
  let rows = [];
  try {
    rows = stmt.all(expr);
  } catch (err) {
    console.error('fts5 query failed:', expr, err.message);
  }
  const ms = performance.now() - start;
  totalMs += ms;
  perTemplate[q.template] ||= { latencies: [], hits: [] };
  perTemplate[q.template].latencies.push(ms);
  perTemplate[q.template].hits.push(rows.length);
}

const summary = {};
for (const [template, data] of Object.entries(perTemplate)) {
  summary[template] = {
    ...summarise(data.latencies),
    avgHits: +(data.hits.reduce((a, b) => a + b, 0) / data.hits.length).toFixed(1),
  };
}

const result = {
  engine: 'fts5',
  docs: docs.length,
  buildMs,
  mem: { load: loaded, built },
  queries: queries.length,
  queryTotalMs: +totalMs.toFixed(0),
  templates: summary,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
