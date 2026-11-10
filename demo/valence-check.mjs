/**
 * Гейты цвета и лада по снятым данным.
 *
 *   node demo/valence-check.mjs --tracks test-results/valence/raw.json \
 *                               --fixtures test-results/valence/fixtures.json
 *
 * V1  тональность читается минимум у 60% выборки (r >= 0.45);
 * V2a синтетические фикстуры: мажор/минор угаданы, квинта и шум обнулены;
 * V5  размах оттенка по выборке не меньше 150°.
 */
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const flag = (name) => {
  const index = argv.indexOf('--' + name);
  return index >= 0 ? argv[index + 1] : null;
};

const read = (path) => (path ? JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) : null);
const tracksPath = flag('tracks');
const fixturesPath = flag('fixtures');
const tracks = read(tracksPath);
const fixtures = read(fixturesPath);

const circular = (a, b) => {
  const delta = Math.abs(a - b) % 360;
  return delta > 180 ? 360 - delta : delta;
};

const results = [];
const gate = (id, label, ok, detail) => results.push({ id, label, ok, detail });

if (tracks) {
  const rows = tracks.summary.map((entry) => {
    const key = entry.profile.key;
    return {
      name: entry.track.replace(/\.(m4a|mp3|wav)$/, ''),
      key: key ? key.key + ' ' + key.mode : '—',
      confidence: key ? key.confidence : 0,
      third: key ? key.thirdScore : 0,
      evidence: key ? key.thirdEvidence : 0,
      valence: entry.profile.valence ? entry.profile.valence.value : 0,
      weight: entry.profile.valence ? entry.profile.valence.weight : 0,
      hue: (entry.hue[0] + entry.hue[1]) / 2,
    };
  });

  const tonal = rows.filter((row) => row.confidence >= 0.45).length;
  const share = tonal / rows.length;
  gate('V1', 'тональность читается (r >= 0.45)', share >= 0.6, tonal + '/' + rows.length + ' = ' + Math.round(share * 100) + '%');

  let spread = 0;
  for (const a of rows) for (const b of rows) spread = Math.max(spread, circular(a.hue, b.hue));
  gate('V5', 'размах оттенка по выборке >= 150°', spread >= 150, Math.round(spread) + '°');

  const minor = rows.filter((row) => row.weight > 0.5 && row.valence < -0.1).length;
  const major = rows.filter((row) => row.weight > 0.5 && row.valence > 0.1).length;
  const neutral = rows.length - minor - major;

  console.log('| трек | ключ | r | терция | evidence | valence | hue |');
  console.log('|---|---|---|---|---|---|---|');
  for (const row of [...rows].sort((a, b) => a.hue - b.hue)) {
    console.log(
      '| ' + row.name + ' | ' + row.key + ' | ' + row.confidence.toFixed(2) + ' | ' + row.third.toFixed(2) +
      ' | ' + row.evidence.toFixed(2) + ' | ' + row.valence.toFixed(2) + ' | ' + Math.round(row.hue) + ' |',
    );
  }
  console.log('\nминор ' + minor + ' · мажор ' + major + ' · нейтрально ' + neutral + '\n');
}

if (fixtures) {
  const expect = {
    'major-c': 'major',
    'minor-c': 'minor',
    'minor-a': 'minor',
    'major-f': 'major',
  };
  let wrong = 0;
  for (const entry of fixtures.summary) {
    const name = entry.track.replace(/\.wav$/, '');
    const key = entry.profile.key;
    const valence = entry.profile.valence.value;
    const expected = expect[name];
    let ok;
    if (expected) ok = key && key.mode === expected && Math.abs(valence) > 0.5;
    else ok = Math.abs(valence) < 0.05; // квинта и шум обязаны обнулиться
    if (!ok) wrong += 1;
    console.log(
      '  ' + name.padEnd(12) + (key ? key.mode + ' r ' + key.confidence.toFixed(2) : 'без ключа') +
      '  valence ' + valence.toFixed(2) + '  ' + (ok ? 'ok' : 'ПРОВАЛ'),
    );
  }
  gate('V2a', 'фикстуры: лад угадан, квинта и шум обнулены', wrong === 0, wrong === 0 ? 'все верно' : wrong + ' провалов');
}

console.log('');
for (const item of results) {
  console.log((item.ok ? 'PASS ' : 'FAIL ') + item.id + '  ' + item.label + ' — ' + item.detail);
}
const failed = results.filter((item) => !item.ok).length;
console.log('\n' + (failed === 0 ? 'все гейты пройдены' : failed + ' гейтов провалено'));
process.exit(failed === 0 ? 0 : 1);
