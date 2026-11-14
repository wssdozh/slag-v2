import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCorpus } from './common.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const n = Number(process.argv[2] || 10000);
const out = resolve(process.argv[3] || `${__dirname}/../.data/corpus-${n}.jsonl`);
const seed = Number(process.argv[4] || 42);

const docs = generateCorpus(n, seed);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, docs.map((d) => JSON.stringify(d)).join('\n') + '\n');
console.log(`wrote ${docs.length} docs -> ${out}`);
