#!/usr/bin/env node
// CPU-only baseline for the startup read path: serialize a deterministic corpus, then parse every
// note back with `parseMarkdownToItem`, the call that turns a file on disk into an item.
//
// Excluded: disk I/O, Tauri IPC, React render/commit, Android. This is not a cold-open number and
// cannot be subtracted from a full user-path measurement taken on another host: only the same
// host, corpus and build compare.
//
//   node scripts/bench/vault/cpu-baseline.mjs            -> test-results/perf/vault-cpu-baseline.json
//   node scripts/bench/vault/cpu-baseline.mjs after 7    -> ...vault-cpu-after.json, 7 runs

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { generateCorpus, summarise } from '../search/common.mjs';
import { parseMarkdownToItem, serializeItemToMarkdown } from '../../../src/lib/vault/markdownSerializer.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { runs: { type: 'string', short: 'r' } },
});
const label = positionals[0] || 'baseline';
const runs = Number(values.runs ?? positionals[1] ?? 5);
if (!/^[a-zA-Z0-9_-]+$/.test(label)) throw new Error('label must match [a-zA-Z0-9_-]+');
if (!Number.isInteger(runs) || runs < 1 || runs > 50) throw new Error('runs must be an integer 1–50');

const SIZES = [100, 1000, 5000];
const SEED = 42;

/** Same seed → same docs → same bytes: a comparison is only valid against this corpus. */
function buildCorpus(count) {
  const docs = generateCorpus(count, SEED);
  const items = docs.map((doc, index) => ({
    id: doc.id,
    type: doc.type,
    title: doc.title,
    content: doc.content,
    folder: doc.folder,
    tags: doc.tags,
    createdAt: doc.updatedAt - 60_000,
    updatedAt: doc.updatedAt,
    filename: `${doc.id}.md`,
    ...(doc.type === 'task' ? { status: index % 3 === 0 ? 'todo' : 'done', priority: 'none' } : {}),
  }));
  return { items, folders: [...new Set(docs.map((doc) => doc.folder))] };
}

const KB = (bytes) => Math.round((bytes / 1024) * 10) / 10;
const results = {};

for (const count of SIZES) {
  const { items, folders } = buildCorpus(count);

  // Serialization only builds the corpus; the startup read under test is the parse loop below.
  const serializeMs = [];
  let markdown = [];
  for (let run = 0; run <= runs; run += 1) {
    const started = performance.now();
    markdown = items.map((item) => serializeItemToMarkdown(item));
    if (run > 0) serializeMs.push(performance.now() - started);
  }

  const bytes = markdown.reduce((sum, text) => sum + Buffer.byteLength(text), 0);
  const sha256 = createHash('sha256').update(markdown.join('\n')).digest('hex');
  const parseMs = [];
  let mismatches = 0;
  for (let run = 0; run <= runs; run += 1) {
    const started = performance.now();
    for (const [index, text] of markdown.entries()) {
      // Empty fallback id: a note that lost its frontmatter id must come back empty, not borrow the
      // expected one from the call and make the identity check tautological.
      const parsed = parseMarkdownToItem(text, '', items[index].folder);
      if (run === 0 && (parsed.id !== items[index].id || parsed.folder !== items[index].folder)) mismatches += 1;
    }
    if (run > 0) parseMs.push(performance.now() - started);
  }

  const parse = summarise(parseMs);
  results[count] = {
    corpus: { notes: items.length, folders: folders.length, bytes, kb: KB(bytes), avgNoteBytes: Math.round(bytes / items.length), sha256 },
    serialize: summarise(serializeMs),
    parse,
    parsePerNoteMs: Number((parse.p50 / items.length).toFixed(4)),
    roundTripMismatches: mismatches,
  };
}

const mismatchTotal = Object.values(results).reduce((sum, row) => sum + row.roundTripMismatches, 0);

const report = {
  name: 'vault-cpu-baseline',
  label,
  cpuOnly: true,
  units: 'ms',
  measuredAt: new Date().toISOString(),
  runtime: { node: process.version, platform: process.platform, arch: process.arch, runs, seed: SEED },
  excludes: ['disk I/O', 'tauri ipc', 'react render/commit', 'android'],
  comparable: 'same host, same corpus, same build only; not separable from a full user-path number on another host',
  corpusGenerator: 'scripts/bench/search/common.mjs#generateCorpus (seed-only, no Date.now)',
  roundTripMismatches: mismatchTotal,
  results,
};

const outFile = resolve(root, `test-results/perf/vault-cpu-${label}.json`);
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`vault-cpu-baseline [${label}] cpu-only, ${runs} runs + 1 warm-up per size`);
console.log('  notes | kb      | serialize p50 | parse p50/p95 | ms/note');
for (const [count, row] of Object.entries(results)) {
  console.log(
    `  ${count.padStart(5)} | ${String(row.corpus.kb).padStart(7)} | ${String(row.serialize.p50).padStart(13)} ` +
    `| ${`${row.parse.p50} / ${row.parse.p95}`.padStart(13)} | ${row.parsePerNoteMs}`,
  );
}
console.log(`  report: ${outFile.replace(/\\/g, '/').slice(root.length + 1)}`);
if (mismatchTotal > 0) {
  // A smaller parse number would just mean "parsed less": the run fails, the artifact stays.
  console.error(`round-trip mismatch: ${mismatchTotal} note(s) did not parse back to their corpus identity`);
  process.exitCode = 1;
}
