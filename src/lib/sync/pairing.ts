import type { DeviceSyncMode, PairingSessionData, PairingClaimResult, PairingPollResult } from './types';
import { accountClient } from './account';
import { bytesToBase64, base64ToBytes } from '../media/byteCodec';
import { SYNC_INTERVALS } from '../../config';

function pairingHeaders(serverUrl: string, includeJson = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeJson) headers['Content-Type'] = 'application/json';
  const token = accountClient.getToken(serverUrl);
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** Creates a new 5-minute pairing session with a 6-digit PIN on the relay server */
export async function createPairingSession(
  serverUrl: string,
  deviceId: string
): Promise<PairingSessionData> {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  const res = await fetch(`${cleanUrl}/api/pair/create`, {
    method: 'POST',
    headers: pairingHeaders(serverUrl),
    body: JSON.stringify({ deviceId, publicKey: `pk_${deviceId}` }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create pairing session: ${res.statusText}`);
  }

  const data = await res.json();
  const qrPayload = JSON.stringify({
    pin: data.pin,
    session: data.sessionId,
    server: cleanUrl,
    host: deviceId,
  });

  return {
    pin: data.pin,
    sessionId: data.sessionId,
    expiresIn: data.expiresIn,
    hostDeviceId: deviceId,
    hostPublicKey: `pk_${deviceId}`,
    qrPayload,
  };
}

/** Claims an existing pairing session on the guest device using the 6-digit PIN (Zero Telemetry) */
export async function claimPairingSession(
  serverUrl: string,
  pin: string,
  guestEphemeralPk: string,
  deviceId?: string
): Promise<PairingClaimResult> {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  const res = await fetch(`${cleanUrl}/api/pair/claim`, {
    method: 'POST',
    headers: pairingHeaders(serverUrl),
    body: JSON.stringify({
      pin: pin.trim(),
      publicKey: guestEphemeralPk,
      deviceId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Invalid or expired PIN: ${res.statusText}`);
  }

  return res.json();
}

function utf8ToBase64(str: string): string {
  return bytesToBase64(new TextEncoder().encode(str));
}

function base64ToUtf8(b64: string): string {
  return new TextDecoder().decode(base64ToBytes(b64));
}

async function postPairing(
  serverUrl: string,
  action: 'approve' | 'reject',
  payload: Record<string, unknown>
): Promise<boolean> {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  const res = await fetch(`${cleanUrl}/api/pair/${action}`, {
    method: 'POST',
    headers: pairingHeaders(serverUrl),
    body: JSON.stringify(payload),
  });
  return res.ok;
}

/** Host approves pairing session and sends encrypted vault key */
export async function approvePairingSession(
  serverUrl: string,
  sessionId: string,
  payloadText: string
): Promise<boolean> {
  return postPairing(serverUrl, 'approve', {
    sessionId,
    encryptedPayload: utf8ToBase64(payloadText),
  });
}

/** Approves account pairing with a vault key encrypted for the guest device. */
export async function approveAccountPairingSession(
  serverUrl: string,
  sessionId: string,
  payload: { vaultId: string; vaultName: string; mode: DeviceSyncMode; encryptedKey: string }
): Promise<boolean> {
  return postPairing(serverUrl, 'approve', { sessionId, ...payload });
}

/** Host rejects pairing session and terminates exchange */
export async function rejectPairingSession(
  serverUrl: string,
  sessionId: string
): Promise<boolean> {
  return postPairing(serverUrl, 'reject', { sessionId });
}

/** Polls current status of a pairing session */
export async function pollPairingSession(
  serverUrl: string,
  sessionId: string
): Promise<PairingPollResult> {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  const res = await fetch(`${cleanUrl}/api/pair/poll?session=${encodeURIComponent(sessionId)}`, {
    headers: pairingHeaders(serverUrl, false),
  });
  if (!res.ok) {
    throw new Error(`Failed to poll pairing session: ${res.statusText}`);
  }
  return res.json();
}

/** Legacy exchange compatibility fallback */
export async function sendPairingPayload(
  serverUrl: string,
  sessionId: string,
  _hostDeviceId: string,
  payloadText: string
): Promise<boolean> {
  return approvePairingSession(serverUrl, sessionId, payloadText);
}

/** Guest device polls for the exchanged payload until received or timeout */
export async function pollPairingPayload(
  serverUrl: string,
  sessionId: string,
  _guestDeviceId: string,
  timeoutMs: number = SYNC_INTERVALS.PAIRING_TIMEOUT_MS,
  intervalMs: number = SYNC_INTERVALS.PAIRING_POLL_INTERVAL_MS
): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const data = await pollPairingSession(serverUrl, sessionId);
      if (data.status === 'rejected') {
        throw new Error('Подключение отклонено на основном устройстве');
      }
      if (data.status === 'approved' && data.exchangePayload) {
        return base64ToUtf8(data.exchangePayload);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('отклонено')) {
        throw e;
      }
      // transient network polling error, continue
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error('Время ожидания подтверждения истекло');
}
