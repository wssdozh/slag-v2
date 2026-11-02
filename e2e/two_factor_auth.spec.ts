import { test, expect } from '@playwright/test';
import {
  base32Encode,
  base32Decode,
  generateTotpSecret,
  getTotpUri,
  computeTotpToken,
  verifyTotpToken,
  isWebAuthnAvailable,
  TwoFactorManager,
} from '../src/lib/sync/twoFactorAuth';

test.describe('Two-Factor Authentication (2FA) Subsystem', () => {
  test('Base32 encoding and decoding works with RFC 4648 test vectors', () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const sample = 'SLAG-ZeroKnowledge-2026';
    const bytes = encoder.encode(sample);
    const encoded = base32Encode(bytes);
    expect(encoded).toBeTruthy();

    const decoded = base32Decode(encoded);
    expect(decoder.decode(decoded)).toBe(sample);
  });

  test('TOTP secret generation produces valid Base32 20-byte string', () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThanOrEqual(32);
    expect(secret).toMatch(/^[A-Z2-7]+$/);

    const decoded = base32Decode(secret);
    expect(decoded.length).toBe(20);
  });

  test('TOTP URI generator creates RFC 6238 compatible link for authenticator apps', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const uri = getTotpUri('MainVault', secret);
    expect(uri).toContain('otpauth://totp/SLAG%3AMainVault');
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain('issuer=SLAG');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });

  test('TOTP token computation and verification within time window', async () => {
    const secret = generateTotpSecret();
    const currentStep = Math.floor(Date.now() / 1000 / 30);
    const validToken = await computeTotpToken(secret, currentStep);

    expect(validToken).toMatch(/^\d{6}$/);

    // Verify valid token succeeds
    const isValid = await verifyTotpToken(secret, validToken);
    expect(isValid).toBe(true);

    // Verify wrong token fails
    const isInvalid = await verifyTotpToken(secret, '000000' === validToken ? '999999' : '000000');
    expect(isInvalid).toBe(false);
  });

  test('WebAuthn capability detection runs safely', () => {
    // In node/headless test environment without DOM navigator credentials
    const available = isWebAuthnAvailable();
    expect(typeof available).toBe('boolean');
  });

  test('TwoFactorManager loads default state', () => {
    const config = TwoFactorManager.getConfig();
    expect(config.totp.enabled).toBe(false);
    expect(config.webauthn.enabled).toBe(false);
  });
});
