import { requireMerchant } from '@/modules/auth/session-server';
import { getTenant } from '@/modules/merchants/tenants';
import { logoutAction } from '../login/actions';
import { BottomNav } from './bottom-nav';
import { Sidebar } from './sidebar';

export const dynamic = 'force-dynamic';

/**
 * The merchant uses this on a phone day-to-day (bottom tab bar) and on a
 * laptop when they sit down to edit their menu or look at insights (left
 * sidebar). Same screens, same design language either way - only the nav
 * chrome and the content width change with the viewport.
 */
export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  const { tenantId, session } = await requireMerchant();
  const tenant = await getTenant(tenantId);
  const tenantName = tenant?.displayName ?? 'Your shop';
  const published = Boolean(tenant?.publishedAt);
  const impersonated = Boolean(session.impersonatedBy);

  return (
    <div className="min-h-screen md:flex">
      <Sidebar tenantName={tenantName} published={published} impersonated={impersonated} logoutAction={logoutAction} />

      <div className="flex min-h-screen flex-1 flex-col pb-24 md:pb-0">
        {impersonated && (
          <div className="bg-warning-600 px-4 py-2 text-center text-[14px] font-semibold text-white md:hidden">
            You are viewing this account as platform staff. All actions are logged.
          </div>
        )}

        <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 md:hidden">
          <div className="min-w-0">
            <p className="truncate font-display text-[16px] font-semibold">{tenantName}</p>
            <p className="flex items-center gap-1.5 text-[13px] text-ink-400">
              {published ? (
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
              {impersonated ? 'End impersonation' : 'Sign out'}
            </button>
          </form>
        </header>

        <main className="mx-auto w-full max-w-2xl px-4 py-5 md:px-10 md:py-9">{children}</main>
      </div>

      <BottomNav />
    </div>
  );
}
