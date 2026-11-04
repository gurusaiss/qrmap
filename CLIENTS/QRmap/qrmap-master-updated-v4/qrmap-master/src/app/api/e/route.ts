import { NextResponse } from 'next/server';
import { isEventType, recordEvent } from '@/modules/analytics';

export const runtime = 'nodejs';

/**
 * Analytics beacon. Deliberately forgiving about failure: an analytics error
 * must never surface to a customer standing in a shop.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      tenantId?: string;
      eventType?: string;
      referrer?: string | null;
      qr?: boolean;
      targetType?: string;
      targetId?: string;
      section?: string;
    };

    if (!body.tenantId || !body.eventType || !isEventType(body.eventType)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    await recordEvent({
      tenantId: body.tenantId,
      eventType: body.eventType,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0',
      userAgent: request.headers.get('user-agent') ?? '',
      referrer: body.referrer ?? null,
      hasQrParam: body.qr ?? false,
      targetType: body.targetType ?? null,
      targetId: body.targetId ?? null,
      section: body.section ?? null,
      city: request.headers.get('cf-ipcity'),
      country: request.headers.get('cf-ipcountry'),
    });

    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 204 });
  }
}
