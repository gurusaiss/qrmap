'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/admin', label: 'Merchants', exact: true },
  { href: '/admin/merchants/new', label: 'New merchant', exact: true },
  { href: '/admin/settings', label: 'Settings', exact: false },
  { href: '/admin/audit', label: 'Audit log', exact: false },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 text-[14px] font-medium">
      {NAV.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`group relative flex items-center gap-1 rounded-[var(--radius-sm)] px-3 py-2 transition-colors duration-150 ${
              active ? 'text-brand-700' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900'
            }`}
          >
            {label}
            {active && (
              <span
                className="absolute inset-x-3 -bottom-[1px] h-[2px] rounded-full bg-brand-600"
                aria-hidden="true"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
