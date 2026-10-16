'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TABS } from './bottom-nav';

/**
 * Primary nav on laptops/desktops (md+). The phone's bottom tab bar has no
 * room for the shop name or a sign-out control, and six icon-only tabs
 * stretched across a wide screen read as sparse, not confident - a fixed
 * left rail fixes both: it has room for labels, status and sign-out, and it
 * keeps its width however wide the window gets.
 */
export function Sidebar({
  tenantName,
  published,
  impersonated,
  logoutAction,
}: {
  tenantName: string;
  published: boolean;
  impersonated: boolean;
  logoutAction: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] md:flex">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <p className="truncate font-display text-[16px] font-semibold">{tenantName}</p>
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-400">
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

      <nav aria-label="Sections" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {TABS.map(({ href, label, Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-[15px] font-medium transition-colors duration-150 ${
                active ? 'bg-brand-50 text-brand-600' : 'text-ink-700 hover:bg-ink-100'
              }`}
            >
              <Icon active={active} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--border)] p-3">
        {impersonated && (
          <p className="mb-2 rounded-[var(--radius-sm)] bg-warning-50 px-3 py-2 text-[12px] font-medium text-warning-600">
            Viewing as platform staff
          </p>
        )}
        <form action={logoutAction}>
          <button
            type="submit"
            className="tap-target w-full rounded-[var(--radius-sm)] px-3 text-left text-[14px] font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-700"
          >
            {impersonated ? 'End impersonation' : 'Sign out'}
          </button>
        </form>
      </div>
    </aside>
  );
}
