import { NextResponse } from 'next/server';
import { ask } from '@/modules/ai';
import { AiUnavailableError } from '@/modules/ai/provider';
import { RateLimitError } from '@/modules/auth/rate-limit';
import { resolveSlug } from '@/modules/merchants/slugs';
import { visitorHash } from '@/modules/auth/crypto';
import { env } from '@/modules/core/env';

export const runtime = 'nodejs';

/**
 * The tenant is resolved from the URL SLUG, server-side. A tenant id supplied
 * by the client is never read, so the model can only ever be given the data of
 * the business whose page was actually scanned.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const resolution = await resolveSlug(slug);
  if (resolution.kind === 'unknown') {
    return NextResponse.json({ error: 'Business not found.' }, { status: 404 });
  }
  const tenantId = resolution.tenantId;

  let question = '';
  try {
    const body = (await request.json()) as { question?: string };
    question = String(body.question ?? '');
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0';
  const hash = visitorHash({
    secret: env().ANALYTICS_SALT_SECRET,
    dayKey: new Date().toISOString().slice(0, 10),
    ip,
    userAgent: request.headers.get('user-agent') ?? '',
    tenantId,
  });

  try {
    const answer = await ask({ tenantId, question, visitorHash: hash });
    return NextResponse.json({ answer: answer.text, source: answer.source });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: error.message },
        { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } },
      );
    }
    if (error instanceof AiUnavailableError) {
      return NextResponse.json(
        { error: 'The assistant is not available for this business.' },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Something went wrong.' },
      { status: 400 },
    );
  }
}
