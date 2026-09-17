import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  principalFromSession,
  resolveSession,
  type ResolvedSession,
} from './service';
import { AuthorizationError, authorize, type Action, type Principal } from './rbac';

/**
 * Server-side session access.
 *
 * The tenant ALWAYS comes from the session here. No route reads a tenant id
 * from a request body or query string - that is the rule that removes the most
 * common multi-tenant vulnerability class.
 */

export async function currentSession(): Promise<ResolvedSession | null> {
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value);
}

export async function currentPrincipal(): Promise<Principal> {
  return principalFromSession(await currentSession());
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export type MerchantContext = {
  session: ResolvedSession;
  principal: Extract<Principal, { kind: 'merchant' }>;
  tenantId: string;
};

/** Guards every merchant dashboard route. Redirects rather than throwing. */
export async function requireMerchant(action?: Action): Promise<MerchantContext> {
  const session = await currentSession();
  const principal = principalFromSession(session);

  if (!session) redirect('/login');
  if (principal.kind !== 'merchant') {
    // A platform admin visiting the merchant app has no active tenant.
    redirect(principal.kind === 'platform' ? '/admin' : '/login');
  }
  if (action) authorize(principal, action, principal.tenantId);

  return { session, principal, tenantId: principal.tenantId };
}

export type PlatformContext = {
  session: ResolvedSession;
  principal: Extract<Principal, { kind: 'platform' }>;
};

export async function requirePlatform(action?: Action): Promise<PlatformContext> {
  const session = await currentSession();
  const principal = principalFromSession(session);

  if (!session) redirect('/login');
  if (principal.kind !== 'platform') redirect('/app');
  if (action) authorize(principal, action);

  return { session, principal };
}

/** For server actions: returns a friendly message instead of a redirect. */
export function describeAuthError(error: unknown): string {
  if (error instanceof AuthorizationError) return 'You do not have permission to do that.';
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
