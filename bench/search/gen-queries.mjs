import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCorpus, makeRng, TAGS } from './common.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function tokens(text) {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function editOne(word, rng) {
  const i = 1 + Math.floor(rng() * Math.max(1, word.length - 2));
  const op = rng();
  if (op < 0.4) return word.slice(0, i) + word.slice(i + 1);
  if (op < 0.7) return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
  const letters = 'абвгдежзиклмнопрстуфхцчшщыэюя';
  return word.slice(0, i) + letters[Math.floor(rng() * letters.length)] + word.slice(i + 1);
}

export function buildQueries(docs, perTemplate = 20, seed = 7) {
  const rng = makeRng(seed);
  const df = new Map();
  const docTokens = docs.map((d) => tokens(`${d.title} ${d.content} ${d.tags.join(' ')}`));
  for (const toks of docTokens) {
    for (const t of new Set(toks)) df.set(t, (df.get(t) || 0) + 1);
  }

  const ranked = [...df.entries()]
    .filter(([w]) => w.length >= 4)
    .sort((a, b) => a[1] - b[1]);
  const q = (p) => ranked[Math.min(ranked.length - 1, Math.floor(ranked.length * p))][1];
  const band = (lo, hi) => ranked.slice(
    Math.floor(ranked.length * lo),
    Math.max(Math.floor(ranked.length * lo) + 1, Math.floor(ranked.length * hi))
  ).map(([w]) => w);
  const common = band(0.9, 1);
  const mid = band(0.35, 0.6);
  const rare = band(0, 0.08);
  const pick = (arr) => {
    if (!arr.length) throw new Error('empty query pool');
    return arr[Math.floor(rng() * arr.length)];
  };
  if (process.env.BENCH_DEBUG) console.error('df bands', { common: common.length, mid: mid.length, rare: rare.length, min: q(0), median: q(0.5), max: q(1) });

  const queries = [];
  const push = (template, toks, text, extra = {}) =>
    queries.push({ template, tokens: toks, text: text ?? toks.join(' '), ...extra });

  for (let k = 0; k < perTemplate; k++) {
    // 1. single common word
    push('single', [pick(common)]);

    // 2. rare word (df 1..4)
    push('rare', [pick(rare)]);

    // 3. morphology: query the bare stem of an inflected form that exists in docs
    const infl = pick(mid.filter((w) => /(ами|ов|ах|ям|ние|ть|ся|ы|а|и)$/.test(w)));
    const base = infl.replace(/(ами|ов|ах|ям|ние|ть|ся|ы|а|и)$/, '') || infl;
    push('morph', [base], base);

    // 4. one-char typo on a word with df >= 8
    let typo = '';
    for (let attempt = 0; attempt < 50; attempt++) {
      const w = pick(mid);
      const t = editOne(w, rng);
      if (!df.has(t) && t.length >= 4) {
        typo = t;
        break;
      }
    }
    push('typo', [typo || 'ъъъъ']);

    // 5. two adjacent words from a random doc (phrase)
    const doc = docs[Math.floor(rng() * docs.length)];
    const body = tokens(doc.content);
    const i = Math.floor(rng() * Math.max(1, body.length - 2));
    push('phrase', [body[i], body[i + 1]]);

    // 6. three keywords from a doc title
    const titleToks = [...new Set(tokens(doc.title))].slice(0, 3);
    push('and3', titleToks);

    // 7. tag
    push('tag', [pick(TAGS)], pick(TAGS), { tag: true });

    // 8. natural language query
    const longDoc = docs[Math.floor(rng() * docs.length)];
    const lw = [...new Set(tokens(longDoc.content))].slice(0, 2);
    push('long', lw, `найди заметку про ${lw.join(' и ')}`);

    // 9. prefix of a common word
    push('prefix', [pick(common).slice(0, 4)], undefined, { prefix: true });

    // 10. no-hit gibberish
    let miss = '';
    while (!miss || df.has(miss)) {
      miss = Array.from({ length: 6 }, () => 'ъыь'.charAt(Math.floor(rng() * 3)) + 'щюфэ'.charAt(Math.floor(rng() * 4))).join('');
    }
    push('miss', [miss]);
  }

  return { queries, dfSize: df.size, tokenCount: [...df.values()].reduce((a, b) => a + b, 0) };
}

const corpusPath = resolve(process.argv[2] || `${__dirname}/../.data/corpus-10000.jsonl`);
const outPath = resolve(process.argv[3] || `${__dirname}/../.data/queries-10000.json`);
const perTemplate = Number(process.argv[4] || 20);

const docs = await loadCorpus(corpusPath);
const { queries, dfSize } = buildQueries(docs, perTemplate);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({ perTemplate, dfSize, queries }, null, 0));
console.log(`wrote ${queries.length} queries (${perTemplate}/template, ${dfSize} distinct tokens) -> ${outPath}`);
