/**
 * Two-Factor Authentication (2FA) for Zero-Knowledge Vaults
 * Implements:
 * 1. TOTP (RFC 6238) via pure Web Crypto API (HMAC-SHA1, Base32, 6-digit codes)
 * 2. WebAuthn / Passkeys (FIDO2): feature detection and the stored credential state
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export interface TotpConfig {
  enabled: boolean;
  secret: string; // Base32 encoded secret
  verifiedAt?: string;
}

export interface WebAuthnConfig {
  enabled: boolean;
  credentialId?: string;
  transports?: string[];
  registeredAt?: string;
}

export interface TwoFactorState {
  totp: TotpConfig;
  webauthn: WebAuthnConfig;
}

const STORAGE_2FA_KEY = 'slag_vault_2fa_config_v2';

/**
 * Encodes Uint8Array bytes to RFC 4648 Base32 string.
 */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes RFC 4648 Base32 string to Uint8Array bytes.
 */
export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
}

/**
 * Generates a random 20-byte Base32 secret for TOTP (Google Authenticator, Apple Passwords).
 */
export function generateTotpSecret(): string {
  const randomBytes = new Uint8Array(20);
  crypto.getRandomValues(randomBytes);
  return base32Encode(randomBytes);
}

/**
 * Creates standard otpauth:// URI for QR code generators and authenticator apps.
 */
export function getTotpUri(vaultName: string, secret: string, issuer = 'SLAG'): string {
  const cleanIssuer = encodeURIComponent(issuer);
  const cleanLabel = encodeURIComponent(`${issuer}:${vaultName}`);
  return `otpauth://totp/${cleanLabel}?secret=${secret}&issuer=${cleanIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Computes 6-digit TOTP token for a given timestamp step.
 */
export async function computeTotpToken(secret: string, timeStep: number): Promise<string> {
  const secretBytes = base32Decode(secret);
  if (secretBytes.length === 0) return '000000';

  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const stepBuffer = new ArrayBuffer(8);
  const view = new DataView(stepBuffer);
  // Big-endian 64-bit integer
  view.setUint32(0, Math.floor(timeStep / 0x100000000));
  view.setUint32(4, timeStep >>> 0);

  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, stepBuffer));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const token = (binary % 1_000_000).toString().padStart(6, '0');
  return token;
}

/**
 * Verifies a 6-digit TOTP token within a clock drift window (+/- windowSteps * 30s).
 */
export async function verifyTotpToken(
  secret: string,
  userToken: string,
  windowSteps = 1
): Promise<boolean> {
  const cleanToken = userToken.replace(/\D/g, '');
  if (cleanToken.length !== 6) return false;

  const currentStep = Math.floor(Date.now() / 1000 / 30);
  for (let i = -windowSteps; i <= windowSteps; i++) {
    const expected = await computeTotpToken(secret, currentStep + i);
    if (expected === cleanToken) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if WebAuthn / Passkeys API is supported in the current environment.
 */
export function isWebAuthnAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.PublicKeyCredential) &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.credentials)
  );
}

/**
 * Local storage manager for 2FA settings.
 */
export class TwoFactorManager {
  public static getConfig(): TwoFactorState {
    try {
      const raw = localStorage.getItem(STORAGE_2FA_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {
      // fallback
    }

    return {
      totp: { enabled: false, secret: '' },
      webauthn: { enabled: false },
    };
  }

  public static saveConfig(cfg: Partial<TwoFactorState>): TwoFactorState {
    const current = this.getConfig();
    const updated: TwoFactorState = {
      totp: { ...current.totp, ...cfg.totp },
      webauthn: { ...current.webauthn, ...cfg.webauthn },
    };

    try {
      localStorage.setItem(STORAGE_2FA_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
    return updated;
  }
}
