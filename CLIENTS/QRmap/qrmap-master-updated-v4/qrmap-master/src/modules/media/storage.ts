/**
 * Object storage behind a driver interface.
 *
 * R2 is the production target: 10 GB free and, decisively, ZERO egress fees -
 * merchant photos are served on every scan, so egress is the cost that would
 * otherwise scale with our success. The S3-compatible API means migrating to
 * S3/B2/MinIO is a configuration change.
 *
 * Keys are tenant-prefixed (`t/{tenantId}/...`) so storage-layer isolation is
 * visible in the key itself and a mis-scoped URL is obvious in logs.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { env } from '../core/env';

export interface StorageDriver {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}

export function tenantKey(tenantId: string, mediaId: string, variant: string): string {
  return `t/${tenantId}/${mediaId}/${variant}`;
}

/** Rejects any key that tries to escape its tenant prefix. */
export function assertKeyBelongsToTenant(key: string, tenantId: string): void {
  const expected = `t/${tenantId}/`;
  if (!key.startsWith(expected) || key.includes('..')) {
    throw new Error('storage key does not belong to this tenant');
  }
}

const localDriver = (): StorageDriver => {
  const base = resolve(env().STORAGE_LOCAL_DIR);
  return {
    name: 'local',
    async put(key, body) {
      const path = join(base, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    },
    async get(key) {
      try {
        return await readFile(join(base, key));
      } catch {
        return null;
      }
    },
    async delete(key) {
      try {
        await unlink(join(base, key));
      } catch {
        /* already gone */
      }
    },
    publicUrl(key) {
      return `/api/media/${key}`;
    },
  };
};

/**
 * R2 via the S3 REST API with SigV4, signed here rather than pulling in the AWS
 * SDK - it is ~70 lines against several megabytes of dependency. Despite the
 * name, this is a plain S3-compatible client: any provider with that API
 * works by setting R2_ENDPOINT_HOST and R2_REGION (Backblaze B2, Wasabi,
 * MinIO...). Unset, both default to Cloudflare R2's own shape.
 */
const r2Driver = (): StorageDriver => {
  const e = env();
  const account = e.R2_ACCOUNT_ID ?? '';
  const bucket = e.R2_BUCKET ?? '';
  const accessKey = e.R2_ACCESS_KEY_ID ?? '';
  const secretKey = e.R2_SECRET_ACCESS_KEY ?? '';
  const region = e.R2_REGION;
  const host = e.R2_ENDPOINT_HOST || `${account}.r2.cloudflarestorage.com`;

  const hmac = async (key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> => {
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      'raw',
      key as ArrayBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    return globalThis.crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
  };
  const hex = (buf: ArrayBuffer): string =>
    [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const sha256 = (data: Buffer | string): string =>
    createHash('sha256').update(data).digest('hex');

  async function signedFetch(method: string, key: string, body?: Buffer, contentType?: string) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256(body ?? '');
    const canonicalUri = `/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

    const headers: Record<string, string> = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    if (contentType) headers['content-type'] = contentType;

    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map((h) => `${h}:${headers[h]}\n`)
      .join('');

    const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const scope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');

    let signingKey: ArrayBuffer = await hmac(new TextEncoder().encode(`AWS4${secretKey}`), dateStamp);
    for (const part of [region, 's3', 'aws4_request']) signingKey = await hmac(signingKey, part);
    const signature = hex(await hmac(signingKey, stringToSign));

    return fetch(`https://${host}${canonicalUri}`, {
      method,
      headers: {
        ...headers,
        Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      ...(body ? { body: new Uint8Array(body) } : {}),
    });
  }

  return {
    name: 'r2',
    async put(key, body, contentType) {
      const res = await signedFetch('PUT', key, body, contentType);
      if (!res.ok) throw new Error(`R2 upload failed: ${res.status}`);
    },
    async get(key) {
      const res = await signedFetch('GET', key);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    },
    async delete(key) {
      await signedFetch('DELETE', key);
    },
    publicUrl(key) {
      const base = env().R2_PUBLIC_BASE_URL;
      return base ? `${base.replace(/\/$/, '')}/${key}` : `/api/media/${key}`;
    },
  };
};

let cached: StorageDriver | undefined;

export function storage(): StorageDriver {
  if (!cached) cached = env().STORAGE_DRIVER === 'r2' ? r2Driver() : localDriver();
  return cached;
}
