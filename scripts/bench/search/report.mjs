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
  { key: 'orama-english', label: 'orama до фикса (english + скан)' },
  { key: 'orama-russian', label: 'orama после фикса (russian)' },
  { key: 'fts5', label: 'sqlite fts5' },
  { key: 'fallback', label: 'линейный скан (level C)' },
];

const TEMPLATES = ['single', 'rare', 'morph', 'typo', 'phrase', 'and3', 'tag', 'long', 'prefix', 'miss'];

const lines = [];
const say = (s = '') => {
  lines.push(s);
  console.log(s);
};

say('# Поиск: до/после фикса, orama vs fts5 vs линейный скан');
say('');
say('корпус: синтетические заметки, zipf-распределение, поля title/content/tags/folder, выдача 15.');
say('«до фикса» — боевой путь приложения: english-токенайзер (кириллица не индексируется) + линейный скан на промахе.');
say('«после фикса» — language: russian, tolerance только на однотокенных, скана нет.');
say('');

for (const n of [...byN.keys()].sort((a, b) => a - b)) {
  const group = byN.get(n);
  say(`## ${n.toLocaleString('ru-RU')} заметок`);
  say('');
  say('| движок | сборка индекса | RSS после | оверхед индекса | heap индекса |');
  say('|---|---:|---:|---:|---:|');
  for (const { key, label } of ENGINES) {
    const r = group[key];
    if (!r) continue;
    const delta = +(r.mem.built.rssMB - r.mem.load.rssMB).toFixed(1);
    const build = r.buildMs ? `${Math.round(r.buildMs)} ms` : '—';
    say(`| ${label} | ${build} | ${r.mem.built.rssMB} MB | ${r.buildMs ? `${delta} MB` : '—'} | ${r.mem.built.heapMB} MB |`);
  }
  say('');

  say('| шаблон | до: p50 | после: p50 | fts5: p50 | скан: p50 | hits после | hits fts5 |');
  say('|---|---:|---:|---:|---:|---:|---:|');
  for (const t of TEMPLATES) {
    const cell = (key) => {
      const s = group[key]?.templates[t];
      return s ? `${s.p50} ms` : '—';
    };
    const hits = (key) => {
      const s = group[key]?.templates[t];
      return s ? s.avgHits : '—';
    };
    say(`| ${t} | ${cell('orama-english')} | ${cell('orama-russian')} | ${cell('fts5')} | ${cell('fallback')} | ${hits('orama-russian')} | ${hits('fts5')} |`);
  }
  say('');

  const before = group['orama-english'];
  const after = group['orama-russian'];
  if (before) say(`до фикса: ${before.oramaHitQueries}/${before.queries} запросов попадали в индекс, ${before.fellThroughToFallback} уходили в линейный скан.`);
  if (after) say(`после фикса: ${after.oramaHitQueries}/${after.queries} попадают в индекс, в скан не уходит никто.`);
  say('');
}

writeFileSync(join(outDir, 'report.md'), lines.join('\n') + '\n');
console.log(`\nreport -> ${join(outDir, 'report.md')}`);
