import { requireMerchant } from '@/modules/auth/session-server';
import { getTenant } from '@/modules/merchants/tenants';
import { logoutAction } from '../login/actions';
import { BottomNav } from './bottom-nav';

export const dynamic = 'force-dynamic';

/**
 * Mobile-first shell. The merchant will use a phone, not a laptop, so the
 * bottom tab bar is the primary navigation and desktop is the adaptation.
 */
export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  const { tenantId, session } = await requireMerchant();
  const tenant = await getTenant(tenantId);

  return (
    <div className="mx-auto min-h-screen max-w-2xl pb-24">
      {session.impersonatedBy && (
        <div className="bg-warning-600 px-4 py-2 text-center text-[14px] font-semibold text-white">
          You are viewing this account as platform staff. All actions are logged.
        </div>
      )}

      <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-display text-[16px] font-semibold">{tenant?.displayName ?? 'Your shop'}</p>
          <p className="flex items-center gap-1.5 text-[13px] text-ink-400">
            {tenant?.publishedAt ? (
              <>
                <span className="pulse-dot h-1.5 w-1.5 shrink-0 rounded-full bg-success-600" aria-hidden="true" />
                Page is live
              </>
            ) : (
              'Not published yet'
            )}
          </p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="tap-target rounded-[var(--radius-sm)] px-3 text-[14px] font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-700"
          >
            {session.impersonatedBy ? 'End impersonation' : 'Sign out'}
          </button>
        </form>
      </header>

      <main className="px-4 py-5">{children}</main>

      <BottomNav />
    </div>
  );
}
