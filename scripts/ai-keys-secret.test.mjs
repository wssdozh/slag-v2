// Provider keys live in the secret store, the connections live in localStorage. These are the two
// pure moves that keep that promise: what goes to disk and what comes back with the keys restored.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aiKeySecretName,
  applyAiKeys,
  splitAiKeys,
  stripAiKeys,
} from '../src/lib/ai/connections/secrets.ts';

const groq = {
  id: 'groq',
  kind: 'groq',
  label: 'Groq',
  apiKey: 'gsk_live_123',
  baseUrl: 'https://api.groq.com/openai/v1',
  protocol: 'chat',
  models: { chat: 'llama-3.3-70b', stt: 'whisper-large-v3' },
};

const custom = {
  id: 'my-proxy',
  kind: 'custom',
  label: 'Proxy',
  apiKey: 'sk-custom-456',
  baseUrl: 'https://proxy.local/v1',
  protocol: 'chat',
  models: { chat: 'gpt-4o-mini' },
};

const settings = {
  sourceMode: 'byok',
  subscriptionModel: 'smart',
  connections: [groq, custom],
  roles: { chat: 'groq', vision: null, stt: 'groq' },
  reasoningEffort: 'medium',
  autoTagging: false,
  autoTriage: false,
  webSearchEnabled: true,
  maxTagsPerNote: 5,
  allowNewTags: false,
  tagCaseStyle: 'kebab-case',
  customTagRules: 'не тегировать служебное',
};

test('save: the key never survives into what goes to localStorage', () => {
  const stored = stripAiKeys(settings);
  const serialized = JSON.stringify(stored);

  assert.ok(!serialized.includes('gsk_live_123'), 'ключ groq не должен попасть в настройки');
  assert.ok(!serialized.includes('sk-custom-456'), 'ключ custom не должен попасть в настройки');
  assert.deepEqual(stored.connections.map((connection) => connection.apiKey), ['', '']);
  assert.deepEqual(stored.connections.map((connection) => connection.id), ['groq', 'my-proxy']);
});

test('save: everything that is not a key is left alone, and the input is not mutated', () => {
  const stored = stripAiKeys(settings);

  assert.equal(stored.roles.chat, 'groq');
  assert.equal(stored.maxTagsPerNote, 5);
  assert.equal(stored.tagCaseStyle, 'kebab-case');
  assert.equal(stored.connections[0].models.stt, 'whisper-large-v3');
  assert.equal(stored.connections[1].baseUrl, 'https://proxy.local/v1');
  assert.equal(settings.connections[0].apiKey, 'gsk_live_123', 'исходные настройки не портятся');
});

test('load: the key comes back from the lookup', () => {
  const secrets = new Map([
    [aiKeySecretName('groq'), 'gsk_live_123'],
    [aiKeySecretName('my-proxy'), 'sk-custom-456'],
  ]);
  const loaded = applyAiKeys(stripAiKeys(settings), (key) => secrets.get(key) ?? null);

  assert.deepEqual(loaded.connections, settings.connections);
  assert.equal(loaded.connections[0].apiKey, 'gsk_live_123');
  assert.equal(loaded.connections[1].apiKey, 'sk-custom-456');
  assert.deepEqual(loaded.roles, settings.roles);
});

test('load: a connection with no secret reads as an empty key, not as a broken one', () => {
  const loaded = applyAiKeys(stripAiKeys(settings), () => null);

  for (const connection of loaded.connections) {
    assert.equal(connection.apiKey, '');
    assert.equal(typeof connection.apiKey, 'string');
  }
});

test('load: a plaintext key left by a degraded store is not thrown away', () => {
  // A browser without a working IndexedDB keeps writing keys the old way — the fallback must
  // still hand them to the app instead of blanking them out.
  const loaded = applyAiKeys(settings, () => null);

  assert.equal(loaded.connections[0].apiKey, 'gsk_live_123');
});

test('migration: only non-empty keys are taken, and the rest of the JSON is untouched', () => {
  const raw = {
    sourceMode: 'byok',
    connections: [
      { ...groq },
      { ...custom, apiKey: '   ' },
      { id: 'no-key', kind: 'gemini', label: 'Gemini', baseUrl: 'https://x', protocol: 'chat', models: {} },
    ],
    roles: { chat: 'groq', vision: null, stt: 'groq' },
    autoTagging: false,
    customTagRules: 'что-то своё',
  };

  const { keys, settings: cleaned } = splitAiKeys(raw);

  assert.deepEqual(keys, [{ key: 'ai-key:groq', value: 'gsk_live_123' }]);
  assert.equal(cleaned.autoTagging, false);
  assert.equal(cleaned.customTagRules, 'что-то своё');
  assert.deepEqual(cleaned.roles, raw.roles);
  assert.deepEqual(cleaned.connections[0], {
    id: 'groq',
    kind: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    protocol: 'chat',
    models: { chat: 'llama-3.3-70b', stt: 'whisper-large-v3' },
  });
  assert.ok(!JSON.stringify(cleaned).includes('gsk_live_123'));
  assert.ok(!JSON.stringify(cleaned).includes('sk-custom-456'));
  assert.equal(raw.connections[0].apiKey, 'gsk_live_123', 'вход не мутируется');
});

test('migration: the second run over the cleaned JSON does nothing', () => {
  const first = splitAiKeys({ connections: [groq, custom] });
  const second = splitAiKeys(first.settings);

  assert.equal(first.keys.length, 2);
  assert.deepEqual(second.keys, []);
  assert.deepEqual(second.settings, first.settings);
});

test('migration: a JSON without connections or without keys is a no-op', () => {
  assert.deepEqual(splitAiKeys(null), { keys: [], settings: null });
  assert.deepEqual(splitAiKeys('nonsense'), { keys: [], settings: null });
  assert.deepEqual(splitAiKeys({ provider: 'groq', groqApiKey: 'legacy' }).keys, []);
  assert.deepEqual(splitAiKeys({ connections: [] }).keys, []);
});
