/**
 * TOTP (RFC 6238) for mandatory platform-admin 2FA.
 *
 * Implemented directly on `node:crypto` rather than pulling in a dependency —
 * it is ~10 lines of HMAC-SHA1 truncation, a stable 15-year-old standard, and
 * every authenticator app (Google Authenticator, Authy, 1Password) implements
 * it identically, so there is nothing an external library buys us here.
 */
import { createHmac, randomBytes } from 'node:crypto';

const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function base32Encode(buffer: Buffer): string {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  counterBuffer.writeUInt32BE(counter % 2 ** 32, 4);

  const hmac = createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const b0 = hmac[offset] ?? 0;
  const b1 = hmac[offset + 1] ?? 0;
  const b2 = hmac[offset + 2] ?? 0;
  const b3 = hmac[offset + 3] ?? 0;
  const binary = ((b0 & 0x7f) << 24) | (b1 << 16) | (b2 << 8) | b3;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * Verifies a 6-digit code, allowing ±1 time step (30s) of clock drift — the
 * standard tolerance every authenticator app and RFC 6238 implementation uses.
 */
export function verifyTotp(secret: string, code: string, now = new Date()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const key = base32Decode(secret);
  const counter = Math.floor(now.getTime() / 1000 / STEP_SECONDS);
  for (const drift of [0, -1, 1]) {
    if (hotp(key, counter + drift) === code) return true;
  }
  return false;
}

/** `otpauth://` URI for rendering as a QR code in an authenticator app. */
export function totpProvisioningUri(secret: string, accountLabel: string, issuer = 'MerchantPlatform'): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}
