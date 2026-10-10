import Link from 'next/link';
import { requireMerchant } from '@/modules/auth/session-server';
import { getTenant } from '@/modules/merchants/tenants';
import { logoutAction } from '../login/actions';

export const dynamic = 'force-dynamic';

const TABS = [
  { href: '/app', label: 'Home' },
  { href: '/app/catalog', label: 'Menu' },
  { href: '/app/offers', label: 'Offers' },
  { href: '/app/qr', label: 'QR' },
  { href: '/app/insights', label: 'Insights' },
  { href: '/app/more', label: 'More' },
];

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

      <header className="flex items-center justify-between border-b border-ink-100 bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{tenant?.displayName ?? 'Your shop'}</p>
          <p className="text-[13px] text-ink-400">
            {tenant?.publishedAt ? 'Page is live' : 'Not published yet'}
          </p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="tap-target rounded-lg px-3 text-[14px] font-medium text-ink-500">
            Sign out
          </button>
        </form>
      </header>

      <main className="px-4 py-5">{children}</main>

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 mx-auto flex max-w-2xl border-t border-ink-200 bg-white"
      >
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="tap-target flex flex-1 flex-col items-center justify-center py-2 text-[13px] font-medium text-ink-700"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
