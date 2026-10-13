/**
 * Slug rules - the permanence invariant (docs/03 §E2).
 *
 * Slugs are short so the encoded URL stays short, which keeps the QR module
 * count low, which is what lets the printed code still scan at 2cm and from
 * across a room.
 */

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

/**
 * Reserved at the first path segment. Anything that is or might become a
 * platform route must never be claimable by a merchant.
 */
export const RESERVED_SLUGS = new Set([
  'about', 'account', 'admin', 'api', 'app', 'assets', 'auth', 'billing', 'blog',
  'contact', 'dashboard', 'docs', 'download', 'faq', 'favicon', 'help', 'home',
  'image', 'images', 'invite', 'legal', 'login', 'logout', 'm', 'mail', 'media',
  'new', 'null', 'offers', 'onboarding', 'partner', 'password', 'pricing',
  'privacy', 'public', 'q', 'qr', 'register', 'reset', 'robots', 'root', 's',
  'search', 'security', 'settings', 'signin', 'signup', 'sitemap', 'static',
  'status', 'support', 'system', 'terms', 'test', 'undefined', 'user', 'users',
  'verify', 'www',
]);

export type SlugError = 'too_short' | 'too_long' | 'invalid_characters' | 'reserved';

export function validateSlug(slug: string): SlugError | null {
  if (slug.length < SLUG_MIN) return 'too_short';
  if (slug.length > SLUG_MAX) return 'too_long';
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) return 'invalid_characters';
  if (slug.includes('--')) return 'invalid_characters';
  if (RESERVED_SLUGS.has(slug)) return 'reserved';
  return null;
}

export function slugErrorMessage(error: SlugError): string {
  switch (error) {
    case 'too_short':
      return `Web address must be at least ${SLUG_MIN} characters.`;
    case 'too_long':
      return `Web address must be ${SLUG_MAX} characters or fewer.`;
    case 'invalid_characters':
      return 'Use only lowercase letters, numbers and single hyphens.';
    case 'reserved':
      return 'That web address is reserved. Please choose another.';
  }
}

/**
 * Lowercases, swaps `&` for "and", and collapses anything that isn't
 * [a-z0-9] into single hyphens, trimmed at both ends. Pure character
 * cleanup - it does not enforce length or reserved-word rules, so the
 * result still needs `validateSlug`.
 */
export function normalizeSlugInput(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-$/, '');
}

/** Best-effort slug from a business name. Never guaranteed unique. */
export function slugifyBusinessName(name: string): string {
  const trimmed = normalizeSlugInput(name);
  if (trimmed.length >= SLUG_MIN && !RESERVED_SLUGS.has(trimmed)) return trimmed;
  return trimmed.length === 0 ? 'shop' : `${trimmed}-shop`.slice(0, SLUG_MAX).replace(/-$/, '');
}

/** Deterministic candidate list for collision resolution. */
export function slugCandidates(name: string, city?: string | null): string[] {
  const base = slugifyBusinessName(name);
  const out: string[] = [base];
  if (city) {
    const withCity = slugifyBusinessName(`${name} ${city}`);
    if (withCity !== base) out.push(withCity);
  }
  for (let i = 2; i <= 9; i++) out.push(`${base}-${i}`.slice(0, SLUG_MAX));
  return out.filter((s) => validateSlug(s) === null);
}
