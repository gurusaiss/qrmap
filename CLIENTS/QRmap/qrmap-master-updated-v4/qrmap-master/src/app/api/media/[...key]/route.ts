import { storage } from '@/modules/media/storage';

export const runtime = 'nodejs';

/** Serves processed images in development; production serves them from R2/CDN. */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const path = key.join('/');
  if (path.includes('..')) return new Response('Bad request', { status: 400 });

  const body = await storage().get(path);
  if (!body) return new Response('Not found', { status: 404 });

  const type = path.endsWith('.avif')
    ? 'image/avif'
    : path.endsWith('.webp')
      ? 'image/webp'
      : 'application/octet-stream';

  return new Response(new Uint8Array(body), {
    headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
