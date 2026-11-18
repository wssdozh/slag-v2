#!/usr/bin/env node
// Builds docs/CODE_MAP.md: one row per module so an agent can answer
// "where does X live" by reading one file instead of grepping the tree.
// No dependencies, deterministic, <= 500 lines of output.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'docs', 'CODE_MAP.md');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'target', 'test-results', '__pycache__']);

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const rel = (p) => relative(ROOT, p).split(sep).join('/');

// --- imports ---------------------------------------------------------------

const SPEC_RE = /from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function importsOf(source) {
  const out = [];
  for (const m of source.matchAll(SPEC_RE)) out.push(m[1] ?? m[2]);
  return out;
}

function resolveSpec(spec, fromFile) {
  if (!spec.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), spec);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return resolve(candidate);
  }
  return null;
}

// --- exports ---------------------------------------------------------------

const NAME_RE =
  /export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
const LIST_RE = /export\s*(?:type\s*)?\{([^}]*)\}/g;
const STAR_RE = /export\s*\*\s*from\s*['"]([^'"]+)['"]/g;

function exportsOf(source) {
  const names = new Set();
  for (const m of source.matchAll(NAME_RE)) names.add(m[1]);
  for (const m of source.matchAll(LIST_RE)) {
    for (const piece of m[1].split(',')) {
      const name = piece.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  for (const m of source.matchAll(STAR_RE)) names.add(`* from ${m[1]}`);
  return [...names];
}

const clip = (text) => (text.length > 78 ? `${text.slice(0, 77)}…` : text);

function docLine(block) {
  for (const raw of block) {
    const text = raw
      .trim()
      .replace(/^\/\*+/, '')
      .replace(/^\/+/, '')
      .replace(/\*+\/$/, '')
      .replace(/^\*+/, '')
      .trim();
    if (!text || text.startsWith('@')) continue;
    return text;
  }
  return '';
}

// Two places carry a module's one-liner: a header comment above the imports, and the doc
// comment sitting right on top of the first export. Most files here use the second.
function purposeOf(source) {
  const lines = source.split(/\r?\n/);
  for (const line of lines.slice(0, 40)) {
    const trimmed = line.trim();
    if (/^(import|export)\b/.test(trimmed)) break;
    if (!/^(?:\/\/|\*|\/\*)/.test(trimmed)) continue;
    const text = docLine([trimmed]);
    if (text) return clip(text);
  }
  for (let i = 1; i < Math.min(lines.length, 200); i += 1) {
    if (!/^export\b/.test(lines[i].trim())) continue;
    let start = i;
    while (start > 0 && /^\s*(?:\/\/|\*|\/\*)/.test(lines[start - 1])) start -= 1;
    return start === i ? '' : clip(docLine(lines.slice(start, i)));
  }
  return '';
}

// --- collect ---------------------------------------------------------------

const files = [
  ...walk(join(ROOT, 'src')),
  ...walk(join(ROOT, 'e2e')),
].sort();

// --- where <symbol> ---------------------------------------------------------
// Same walk, no index file: every file parses in well under a second, and a cache
// would only go stale.

const DEFINITION = /^\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+/;

// A named import list can span lines (`import {\n  a,\n  b,\n} from './x'`). Matching the
// symbol against one line reported zero importers for exactly the long lists that matter.
const IMPORT_BLOCK_RE = /(?:^|\n)[ \t]*(?:import|export)[ \t]+(?:type[ \t]+)?\{([^}]*)\}[ \t]*from[ \t]*['"]([^'"]+)['"]/g;

function importSites(source, name) {
  const sites = [];
  for (const match of source.matchAll(IMPORT_BLOCK_RE)) {
    const listStart = match.index + match[0].indexOf('{') + 1;
    for (const piece of match[1].split(',')) {
      const [original, local] = piece.split(/\s+as\s+/).map((part) => part.trim());
      if (original !== name && local !== name) continue;
      const at = listStart + match[1].indexOf(piece) + piece.indexOf(original);
      sites.push(source.slice(0, at).split('\n').length);
    }
  }
  return sites;
}

if (process.argv[2] === 'where') {
  const name = process.argv[3];
  if (!name) {
    console.error('usage: npm run where <symbol>');
    process.exit(1);
  }

  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const word = new RegExp(`\\b${escaped}\\b`);
  const defs = [];
  const uses = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    source.split(/\r?\n/).forEach((line, index) => {
      if (!line.includes(name) || !word.test(line)) return;
      if (DEFINITION.test(line)) defs.push(`${rel(file)}:${index + 1}`);
    });
    for (const line of importSites(source, name)) uses.push(`${rel(file)}:${line}`);
  }

  if (!defs.length && !uses.length) {
    const near = new Set();
    for (const file of files) {
      for (const exported of exportsOf(readFileSync(file, 'utf8'))) {
        if (exported.toLowerCase().includes(name.toLowerCase())) near.add(exported);
      }
    }
    console.error(`не найдено: ${name}`);
    if (near.size) console.error(`похожие: ${[...near].slice(0, 8).join(', ')}`);
    process.exit(1);
  }

  for (const at of defs) console.log(`def  ${at}`);
  for (const at of uses) console.log(`used ${at}`);
  console.log(`\n${defs.length} определений, ${uses.length} импортов`);
  process.exit(0);
}

const modules = new Map();

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  modules.set(file, {
    path: rel(file),
    lines: source.split(/\r?\n/).length,
    exports: exportsOf(source),
    purpose: purposeOf(source),
    consumers: 0,
  });
}

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const spec of importsOf(source)) {
    const target = resolveSpec(spec, file);
    if (target && modules.has(target) && target !== file) modules.get(target).consumers += 1;
  }
}

// --- group -----------------------------------------------------------------

// The bundler entries: nothing imports them, and deleting one takes a whole build with it.
// One per vite config — index.html, the MCP bundle, the headless node.
const ENTRY_POINTS = new Set(['src/main.tsx', 'src/mcp/index.ts', 'src/App.tsx', 'src/node/index.ts']);

function zoneOf(path) {
  const parts = path.split('/');
  if (parts[0] === 'e2e') return 'e2e (playwright)';
  if (parts.length <= 2) return parts[0]; // src/main.tsx
  if (parts.length === 3) return `${parts[0]}/${parts[1]}`; // src/lib/logger.ts
  return `${parts[0]}/${parts[1]}/${parts[2]}`; // src/lib/ai/client.ts
}

const zones = new Map();
for (const mod of modules.values()) {
  const zone = zoneOf(mod.path);
  if (!zones.has(zone)) zones.set(zone, []);
  zones.get(zone).push(mod);
}

const list = [...modules.values()];
// Specs export nothing and import nobody on purpose — only src can be dead.
const suspects = list.filter(
  (m) =>
    m.path.startsWith('src/') &&
    m.consumers === 0 &&
    m.exports.length === 0 &&
    !ENTRY_POINTS.has(m.path),
);
const longest = [...list].sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path)).slice(0, 15);
const totalLines = list.reduce((sum, m) => sum + m.lines, 0);

// --- render ----------------------------------------------------------------

const out = [];
out.push('# CODE_MAP — карта модулей');
out.push('');
out.push('Сгенерировано `npm run map:code`. Руками не править — перезапишется.');
out.push('Читай эту карту до того, как грепать: колонка «импортят» показывает,');
out.push('что модуль реально используется, «что это» — зачем он нужен.');
out.push('');
out.push(`Модулей: **${list.length}**, строк: **${totalLines}**, зон: **${zones.size}**.`);
out.push('');
out.push('## Самые длинные файлы');
out.push('');
out.push('| файл | строк | импортят |');
out.push('|---|---:|---:|');
for (const m of longest) out.push(`| \`${m.path}\` | ${m.lines} | ${m.consumers} |`);
out.push('');

if (suspects.length) {
  out.push('## Кандидаты в мёртвый код');
  out.push('');
  out.push('Никто не импортирует и сами ничего не экспортируют. Проверить и, скорее всего, выпилить.');
  out.push('');
  for (const m of suspects) out.push(`- \`${m.path}\` (${m.lines} строк)`);
  out.push('');
}

const zoneOrder = [...zones.keys()].sort();
for (const zone of zoneOrder) {
  const mods = zones.get(zone).sort((a, b) => a.path.localeCompare(b.path));
  const lines = mods.reduce((sum, m) => sum + m.lines, 0);

  // Specs carry no exports and no purpose line — a table would be 91 empty rows.
  if (zone.startsWith('e2e')) {
    const heavy = [...mods].sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path)).slice(0, 10);
    out.push(`## ${zone} — ${mods.length} файлов, ${lines} строк`);
    out.push('');
    out.push('Таблицу не строю: спеки ничего не экспортируют. Крупнейшие:');
    out.push('');
    for (const m of heavy) out.push(`- \`${m.path}\` — ${m.lines}`);
    out.push('');
    continue;
  }

  out.push(`## ${zone} — ${mods.length} файлов, ${lines} строк`);
  out.push('');
  out.push('| файл | строк | импортят | экспортирует | что это |');
  out.push('|---|---:|---:|---|---|');
  for (const m of mods) {
    const names = m.exports.slice(0, 5).join(', ');
    const rest = m.exports.length > 5 ? `${names}, +${m.exports.length - 5}` : names;
    out.push(`| \`${m.path.replace(`${zone}/`, '')}\` | ${m.lines} | ${m.consumers} | ${rest} | ${m.purpose} |`);
  }
  out.push('');
}

writeFileSync(OUT, `${out.join('\n')}`, 'utf8');
console.log(`CODE_MAP: ${list.length} модулей, ${totalLines} строк → ${rel(OUT)} (${out.length} строк вывода)`);
if (suspects.length) console.log(`кандидатов в мёртвый код: ${suspects.length}`);
