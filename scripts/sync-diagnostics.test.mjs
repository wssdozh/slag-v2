import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatVaultSyncReport } from '../src/lib/sync/diagnostics.ts';

const base = { vaultName: 'main', appVersion: '0.2.5-dev.78', diskFindings: null };
const diagnostics = { lastRelayResponseAt: null, legacyPending: null, registryPending: 1,
  reviews: 0, legacyReviews: 0, conflicts: 0, recovery: 'state', relayHead: null, appliedThrough: 261 };
const status = { state: 'error', isAuthenticated: true, authRequired: true, diagnostics };

test('an unverified queue is not reported as empty', () => {
  const report = formatVaultSyncReport({ ...base, status });
  assert.match(report, /Очередь пакетов: неизвестно/);
  assert.match(report, /Очередь реестра: 1/);
  assert.match(report, /Конфликты: 0/);
  assert.match(report, /Применённая ревизия: 261/);
  assert.match(report, /старый журнал не подтверждён/);
});

test('healthy delivery reports separate verified counts and timestamp', () => {
  const report = formatVaultSyncReport({ ...base, diskFindings: 0, status: { ...status, state: 'connected',
    diagnostics: { ...diagnostics, recovery: 'ready', legacyPending: 0, registryPending: 0, legacyReviews: 1,
      relayHead: 261, lastRelayResponseAt: '2026-11-24T05:23:38.936Z' } } });
  assert.match(report, /есть связь с релеем/);
  assert.match(report, /Очередь пакетов: 0/);
  assert.match(report, /Ревизия релея: 261/);
  assert.match(report, /Старые правки на проверку: 1/);
  assert.match(report, /находок: 0/);
  assert.match(report, /2026-11-24T05:23:38.936Z/);
});

test('offline values are qualified and raw errors and account identifiers are excluded', () => {
  const report = formatVaultSyncReport({ ...base, status: { ...status, state: 'offline', error: 'D:/private bearer secret',
    currentRoomId: 'private-room', diagnostics: { ...diagnostics, registryOnly: true } } });
  assert.match(report, /сведения могут быть устаревшими/);
  assert.match(report, /старый канал изолирован/);
  assert.doesNotMatch(report, /private|bearer|secret/);
});
