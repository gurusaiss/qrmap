import { RateLimitError } from '@/modules/auth/rate-limit';
import { ReviewError, submitReview } from '@/modules/reviews';
import { esc } from '@/modules/merchants/render-html';

export const runtime = 'nodejs';

/**
 * Plain form POST from the public page (works without JavaScript). Answers
 * with a small standalone HTML page rather than redirecting back, so the
 * cached public page never needs a per-request "thanks" state.
 */
const CSP = `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

function page(status: number, title: string, body: string, slug: string | null): Response {
  const back = slug && /^[a-z0-9-]+$/.test(slug) ? `<p><a href="/m/${slug}#reviews">Back to the page</a></p>` : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{font-family:system-ui,sans-serif;max-width:30rem;margin:12vh auto;padding:0 1.2rem;color:#241b15;line-height:1.55}a{color:#c2491d;font-weight:600}</style></head><body><h1>${esc(title)}</h1><p>${esc(body)}</p>${back}</body></html>`;
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': CSP,
    },
  });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return page(400, 'Something went wrong', 'That form could not be read. Please go back and try again.', null);
  }

  const field = (key: string): string | undefined => {
    const v = form.get(key);
    return typeof v === 'string' ? v : undefined;
  };
  const slug = (field('slug') ?? '').trim().toLowerCase();

  // Honeypot: real visitors never see or fill this. Pretend success so bots learn nothing.
  if ((field('website') ?? '') !== '') {
    return page(200, 'Thank you', 'Your review has been received.', slug);
  }

  try {
    await submitReview({
      slug,
      input: { rating: field('rating'), name: field('name'), comment: field('comment') },
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0',
    });
    return page(200, 'Thank you', 'Your review was received. It will appear on the page once the shop approves it.', slug);
  } catch (error) {
    if (error instanceof ReviewError) {
      return page(error.code === 'invalid' ? 400 : 404, 'We could not save your review', error.message, slug);
    }
    if (error instanceof RateLimitError) {
      return page(429, 'Too many reviews', 'You have sent several reviews recently. Please try again tomorrow.', slug);
    }
    return page(500, 'Something went wrong', 'We could not save your review. Please try again in a moment.', slug);
  }
}
