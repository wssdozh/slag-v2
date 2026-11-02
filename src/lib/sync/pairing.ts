import type { PairingSessionData, PairingClaimResult, PairingPollResult } from './types';

/** Creates a new 5-minute pairing session with a 6-digit PIN on the relay server */
export async function createPairingSession(
  serverUrl: string,
  deviceId: string
): Promise<PairingSessionData> {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  const res = await fetch(`${cleanUrl}/api/pair/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  guestEphemeralPk: string
): Promise<PairingClaimResult> {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  const res = await fetch(`${cleanUrl}/api/pair/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pin: pin.trim(),
      publicKey: guestEphemeralPk,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Invalid or expired PIN: ${res.statusText}`);
  }

  return res.json();
}

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/** Host approves pairing session and sends encrypted vault key */
export async function approvePairingSession(
  serverUrl: string,
  sessionId: string,
  payloadText: string
): Promise<boolean> {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  const res = await fetch(`${cleanUrl}/api/pair/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      encryptedPayload: utf8ToBase64(payloadText),
    }),
  });
  return res.ok;
}

/** Host rejects pairing session and terminates exchange */
export async function rejectPairingSession(
  serverUrl: string,
  sessionId: string
): Promise<boolean> {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  const res = await fetch(`${cleanUrl}/api/pair/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  return res.ok;
}

/** Polls current status of a pairing session */
export async function pollPairingSession(
  serverUrl: string,
  sessionId: string
): Promise<PairingPollResult> {
  const cleanUrl = serverUrl.replace(/\/+$/, '');
  const res = await fetch(`${cleanUrl}/api/pair/poll?session=${encodeURIComponent(sessionId)}`);
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
  timeoutMs = 60_000,
  intervalMs = 1500
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
