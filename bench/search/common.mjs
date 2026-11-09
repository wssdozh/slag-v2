import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

// Deterministic LCG so every engine gets the exact same corpus and queries.
export function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SYLL = [
  'ка', 'ро', 'ва', 'ты', 'ми', 'лу', 'жн', 'ст', 'пр', 'до', 'ло', 'не', 'ри', 'со',
  'та', 'ве', 'ни', 'ко', 'ла', 'мо', 'ра', 'се', 'ти', 'во', 'де', 'по', 'за', 'бу',
  'ги', 'же', 'зу', 'ки', 'на', 'об', 'па', 'ре', 'су', 'фа', 'хи', 'це', 'ша', 'ще',
  'эл', 'юн', 'ды', 'кл', 'мы', 'тр', 'вл', 'зн', 'сл', 'кр', 'бл', 'гр', 'др', 'пл',
  'ск', 'хл', 'чр', 'вс', 'гн', 'жм', 'кн', 'лб', 'пт', 'рв', 'св', 'тк', 'фр', 'цв',
];
const ENDING = ['', '', '', 'а', 'ы', 'и', 'ом', 'ами', 'ов', 'ах', 'ям', 'ние', 'ть', 'ся'];

const RU_REAL = (
  'поиск заметка архив проект сервер сборка тест дизайн верстка макет интерфейс кнопка ' +
  'панель окно список папка файл ссылка картинка видео музыка текст статья задача ' +
  'календарь неделя месяц день утро вечер ночь время место город улица дом квартира ' +
  'работа офис встреча звонок письмо ответ вопрос идея план цель отчет бюджет деньги ' +
  'цена магазин покупка доставка заказ клиент команда лидер роль доступ пароль вход ' +
  'профиль настройка параметр значение функция метод класс модуль объект массив строка ' +
  'число тип код ошибка баг фикс релиз версия коммит ветка репозиторий документация ' +
  'инструкция правило пример решение проблема причина следствие результат вывод смысл ' +
  'контекст история память скорость размер вес объем качество уровень опыт навык ' +
  'знание обучение книга фильм сериал игра спорт бег зал здоровье сон еда вода кофе чай ' +
  'погода зима весна лето осень солнце дождь снег ветер лес река море гора дорога машина ' +
  'поезд самолет билет отпуск путешествие отель ресторан кухня рецепт вкус запах цвет ' +
  'свет звук шум тишина голос слово буква знак символ'
).split(' ');

const EN_WORDS = (
  'search note index query token buffer cache stream thread worker package module build ' +
  'release deploy server client request response header cookie session auth key value ' +
  'array object string number boolean function class method error bug fix test lint ' +
  'format import export default async await promise callback event listener state props ' +
  'component render effect hook style theme color font layout grid flex motion animation ' +
  'gesture drag drop scroll swipe sheet modal toast card list table chart icon logo image ' +
  'video audio file folder path root home user account login signup admin panel settings ' +
  'config option flag limit offset page size count sum avg min max sort filter map reduce'
).split(' ');

export const TAGS = (
  'поиск архив заметки идеи работа личное проекты дизайн код rust tauri react sqlite ' +
  'orama тесты релиз документация план здоровье книги фильмы музыка путешествия ' +
  'финансы обучение карьера встречи отчеты инбокс черновики шаблоны ссылки цитаты ' +
  'рецепты спорт сон питание покупки дом ремонт авто гаджеты игры фото видео подкасты ' +
  'статьи лекции конспекты'
).split(' ');

export const FOLDERS = (
  'Личное Работа Проекты Архив Инбокс Черновики Идеи Учеба Здоровье Финансы Дом ' +
  'Путешествия Книги Фильмы Музыка Код Дизайн Встречи Отчеты Шаблоны Ссылки Цитаты ' +
  'Рецепты Заметки'
).split(' ');

function pseudoWord(rng) {
  const n = 2 + (rng() < 0.45 ? 1 : 0);
  let w = '';
  for (let i = 0; i < n; i++) w += SYLL[Math.floor(rng() * SYLL.length)];
  const end = rng() < 0.55 ? ENDING[Math.floor(rng() * ENDING.length)] : '';
  return w + end;
}

export function buildVocab(rng, size = 6000) {
  const seen = new Set();
  const ordered = [];
  const push = (w) => {
    const k = w.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      ordered.push(k);
    }
  };
  shuffle(RU_REAL, rng).forEach(push);
  shuffle(EN_WORDS, rng).forEach(push);
  while (ordered.length < size) push(pseudoWord(rng));

  // Zipf-ish frequencies: rank^1.02, so rank 0 dominates and the tail is rare.
  const weights = ordered.map((_, i) => 1 / Math.pow(i + 1, 1.02));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const cdf = weights.map((w) => (acc += w / total));
  return { words: ordered, cdf };
}

export function sampleWord(vocab, rng) {
  const u = rng();
  let lo = 0;
  let hi = vocab.cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (vocab.cdf[mid] < u) lo = mid + 1;
    else hi = mid;
  }
  return vocab.words[lo];
}

export function generateCorpus(n, seed = 42) {
  const rng = makeRng(seed);
  const vocab = buildVocab(rng);
  const docs = [];
  for (let i = 0; i < n; i++) {
    const titleLen = 3 + Math.floor(rng() * 5);
    const title = Array.from({ length: titleLen }, () => sampleWord(vocab, rng)).join(' ');
    const words = 80 + Math.floor(rng() * 370);
    const content = Array.from({ length: words }, () => sampleWord(vocab, rng)).join(' ');
    const tagCount = 2 + Math.floor(rng() * 4);
    const tags = Array.from({ length: tagCount }, () => TAGS[Math.floor(rng() * TAGS.length)]);
    docs.push({
      id: `note-${i}`,
      type: rng() < 0.7 ? 'note' : rng() < 0.66 ? 'article' : 'task',
      title,
      content,
      tags: [...new Set(tags)],
      folder: FOLDERS[Math.floor(rng() * FOLDERS.length)],
      updatedAt: 1700000000000 + Math.floor(rng() * 20000000000),
    });
  }
  return docs;
}

export async function loadCorpus(file) {
  const docs = [];
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) docs.push(JSON.parse(line));
  }
  return docs;
}

export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function summarise(latencies) {
  const s = [...latencies].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / (s.length || 1);
  return {
    count: s.length,
    mean: +mean.toFixed(2),
    p50: +percentile(s, 50).toFixed(2),
    p95: +percentile(s, 95).toFixed(2),
    max: +(s[s.length - 1] || 0).toFixed(2),
  };
}

export function mb(bytes) {
  return +(bytes / 1024 / 1024).toFixed(1);
}

export function snapshot() {
  if (global.gc) global.gc();
  const m = process.memoryUsage();
  return { rssMB: mb(m.rss), heapMB: mb(m.heapUsed) };
}
