/**
 * Password, OTP and token hashing.
 *
 * scrypt is used rather than argon2id: it is memory-hard, it is in Node's
 * standard library, and it removes a native build dependency. The cost
 * parameters below are tuned so a single hash takes ~100ms on commodity
 * hardware, which is the property that matters.
 */
import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 32 } as const;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize('NFKC'), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: 128 * SCRYPT.N * SCRYPT.r * 2,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nRaw, rRaw, pRaw, saltRaw, keyRaw] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  const salt = Buffer.from(saltRaw ?? '', 'base64url');
  const expected = Buffer.from(keyRaw ?? '', 'base64url');
  if (salt.length === 0 || expected.length === 0) return false;

  const actual = await scryptAsync(password.normalize('NFKC'), salt, expected.length, {
    N,
    r,
    p,
    maxmem: 128 * N * r * 2,
  });

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Opaque session token. Only its hash is ever stored. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Six digits: what merchants expect from an SMS, and rate limits do the rest. */
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Non-reversible, non-correlatable visitor identifier for analytics.
 * The salt rotates daily, so the same visitor produces a different hash
 * tomorrow and long-term tracking is cryptographically impossible.
 */
export function visitorHash(args: {
  secret: string;
  dayKey: string;
  ip: string;
  userAgent: string;
  tenantId: string;
}): string {
  return createHash('sha256')
    .update(`${args.secret}|${args.dayKey}|${args.ip}|${args.userAgent}|${args.tenantId}`)
    .digest('hex')
    .slice(0, 32);
}

export function hashIp(secret: string, ip: string): string {
  return createHash('sha256').update(`${secret}|ip|${ip}`).digest('hex').slice(0, 32);
}
