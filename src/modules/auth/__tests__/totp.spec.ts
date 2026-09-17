import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateTotpSecret, totpProvisioningUri, verifyTotp } from '../totp';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Buffer {
  let bits = '';
  for (const char of input.toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/**
 * Independent RFC 6238 reference implementation, used only to generate exact
 * test vectors. Deliberately NOT the code under test, and deliberately exact
 * (no drift tolerance) so the drift-boundary tests below are unambiguous.
 */
function codeAt(secret: string, epochSeconds: number): string {
  const counter = Math.floor(epochSeconds / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  counterBuffer.writeUInt32BE(counter % 2 ** 32, 4);
  const hmac = createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const b0 = hmac[offset] ?? 0;
  const b1 = hmac[offset + 1] ?? 0;
  const b2 = hmac[offset + 2] ?? 0;
  const b3 = hmac[offset + 3] ?? 0;
  const binary = ((b0 & 0x7f) << 24) | (b1 << 16) | (b2 << 8) | b3;
  return String(binary % 1_000_000).padStart(6, '0');
}

describe('generateTotpSecret', () => {
  it('produces a base32 secret of reasonable length', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThanOrEqual(28);
  });

  it('produces distinct secrets', () => {
    const secrets = new Set(Array.from({ length: 20 }, () => generateTotpSecret()));
    expect(secrets.size).toBe(20);
  });
});

describe('verifyTotp', () => {
  it('accepts the correct code for the current time step', () => {
    const secret = generateTotpSecret();
    const now = new Date('2026-09-17T10:00:00Z');
    const code = codeAt(secret, Math.floor(now.getTime() / 1000));
    expect(verifyTotp(secret, code, now)).toBe(true);
  });

  it('rejects a code from a different secret', () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const now = new Date('2026-09-17T10:00:00Z');
    const codeForB = codeAt(secretB, Math.floor(now.getTime() / 1000));
    expect(verifyTotp(secretA, codeForB, now)).toBe(false);
  });

  it('accepts a code from one step in the past (clock drift tolerance)', () => {
    const secret = generateTotpSecret();
    const now = new Date('2026-09-17T10:00:00Z');
    const previousStep = new Date(now.getTime() - 30_000);
    const code = codeAt(secret, Math.floor(previousStep.getTime() / 1000));
    expect(verifyTotp(secret, code, now)).toBe(true);
  });

  it('accepts a code from one step in the future (clock drift tolerance)', () => {
    const secret = generateTotpSecret();
    const now = new Date('2026-09-17T10:00:00Z');
    const nextStep = new Date(now.getTime() + 30_000);
    const code = codeAt(secret, Math.floor(nextStep.getTime() / 1000));
    expect(verifyTotp(secret, code, now)).toBe(true);
  });

  it('rejects a code from two steps away', () => {
    const secret = generateTotpSecret();
    const now = new Date('2026-09-17T10:00:00Z');
    const twoStepsAgo = new Date(now.getTime() - 60_000);
    const code = codeAt(secret, Math.floor(twoStepsAgo.getTime() / 1000));
    expect(verifyTotp(secret, code, now)).toBe(false);
  });

  it('rejects malformed input without throwing', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, '')).toBe(false);
    expect(verifyTotp(secret, 'abcdef')).toBe(false);
    expect(verifyTotp(secret, '12345')).toBe(false);
    expect(verifyTotp(secret, '1234567')).toBe(false);
  });
});

describe('totpProvisioningUri', () => {
  it('produces a valid otpauth URI containing the secret and account label', () => {
    const secret = generateTotpSecret();
    const uri = totpProvisioningUri(secret, 'admin@example.com');
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain(encodeURIComponent('admin@example.com'));
    expect(uri).toContain(`secret=${secret}`);
  });
});
