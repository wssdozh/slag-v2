import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] || `${__dirname}/../out`);

const runs = readdirSync(outDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(outDir, f), 'utf8')));

const byN = new Map();
for (const r of runs) {
  if (!byN.has(r.docs)) byN.set(r.docs, {});
  byN.get(r.docs)[r.engine] = r;
}

const ENGINES = [
  { key: 'orama-english', label: 'orama (как сейчас, english)' },
  { key: 'orama-russian', label: 'orama (language: russian)' },
  { key: 'orama-russian-clean', label: 'orama (russian, без fallback)' },
  { key: 'fts5', label: 'sqlite fts5' },
  { key: 'fallback', label: 'линейный скан (level C)' },
];

const TEMPLATES = ['single', 'rare', 'morph', 'typo', 'phrase', 'and3', 'tag', 'long', 'prefix', 'miss'];

const lines = [];
const say = (s = '') => {
  lines.push(s);
  console.log(s);
};

say('# Поиск: orama vs fts5 vs линейный скан');
say('');
say('корпус: синтетические заметки, zipf-распределение, поля title/content/tags/folder, лимит выдачи 15.');
say('«orama (как сейчас)» — это ровно то, что делает приложение: `create()` без `language`, поиск с `tolerance: 1`,');
say('а при нуле попаданий — переход в линейный fuzzy-скан по всему корпусу (он же и измерен в этой колонке).');
say('');

for (const n of [...byN.keys()].sort((a, b) => a - b)) {
  const group = byN.get(n);
  say(`## ${n.toLocaleString('ru-RU')} заметок`);
  say('');
  say('| движок | сборка индекса | RSS: загрузка | RSS: индекс | оверхед | heap: индекс |');
  say('|---|---:|---:|---:|---:|---:|');
  for (const { key, label } of ENGINES) {
    const r = group[key];
    if (!r) continue;
    const delta = +(r.mem.built.rssMB - r.mem.load.rssMB).toFixed(1);
    const build = r.buildMs ? `${Math.round(r.buildMs)} ms` : '—';
    const footprint = r.buildMs ? `${delta} MB` : '—';
    say(`| ${label} | ${build} | ${r.mem.load.rssMB} MB | ${r.mem.built.rssMB} MB | ${footprint} | ${r.mem.built.heapMB} MB |`);
  }
  say('');

  say('| шаблон | orama as-is p50 | orama ru p50 | orama ru движок p50 | fts5 p50 | скан p50 | hits as-is | hits ru | hits fts5 |');
  say('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const t of TEMPLATES) {
    const cell = (key) => {
      const s = group[key]?.templates[t];
      return s ? `${s.p50} ms` : '—';
    };
    const hits = (key) => {
      const s = group[key]?.templates[t];
      return s ? s.avgHits : '—';
    };
    say(
      `| ${t} | ${cell('orama-english')} | ${cell('orama-russian')} | ${cell('orama-russian-clean')} | ${cell('fts5')} | ${cell('fallback')} | ${hits('orama-english')} | ${hits('orama-russian')} | ${hits('fts5')} |`
    );
  }
  say('');

  const o = group['orama-english'];
  const r = group['orama-russian'];
  if (o) say(`orama as-is: ${o.oramaHitQueries}/${o.queries} запросов попали в индекс, ${o.fellThroughToFallback} ушли в линейный скан.`);
  if (r) say(`orama russian: ${r.oramaHitQueries}/${r.queries} попали в индекс, ${r.fellThroughToFallback} ушли в линейный скан.`);
  say('');
}

writeFileSync(join(outDir, 'report.md'), lines.join('\n') + '\n');
console.log(`\nreport -> ${join(outDir, 'report.md')}`);
