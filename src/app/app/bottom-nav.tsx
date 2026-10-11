'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type IconProps = { active: boolean };

function IconHome({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M4 11.5 12 4l8 7.5M6 10v9h12v-9"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconList({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconTag({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="m11 3 9 9-8 8-9-9V4h7Z"
        stroke="currentColor"
        strokeWidth={active ? 2.2 : 1.8}
        strokeLinejoin="round"
      />
      <path d="M8 8h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function IconQr({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <rect x="4" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} />
      <rect x="14" y="4" width="6" height="6" rx="1" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} />
      <rect x="4" y="14" width="6" height="6" rx="1" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} />
      <path d="M15 15h2.5M14 18h2M17.5 17.5V20" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" />
    </svg>
  );
}

function IconChart({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M5 19V10M12 19V5M19 19v-6" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" />
    </svg>
  );
}

function IconDots({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <circle cx="5" cy="12" r={active ? 1.8 : 1.5} fill="currentColor" />
      <circle cx="12" cy="12" r={active ? 1.8 : 1.5} fill="currentColor" />
      <circle cx="19" cy="12" r={active ? 1.8 : 1.5} fill="currentColor" />
    </svg>
  );
}

const TABS = [
  { href: '/app', label: 'Home', Icon: IconHome, exact: true },
  { href: '/app/catalog', label: 'Menu', Icon: IconList, exact: false },
  { href: '/app/offers', label: 'Offers', Icon: IconTag, exact: false },
  { href: '/app/qr', label: 'QR', Icon: IconQr, exact: false },
  { href: '/app/insights', label: 'Insights', Icon: IconChart, exact: false },
  { href: '/app/more', label: 'More', Icon: IconDots, exact: false },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-2xl border-t border-ink-200 bg-[var(--surface)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--surface)]/80"
    >
      {TABS.map(({ href, label, Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className="tap-target group relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[12px] font-medium"
          >
            <span
              className={`flex h-8 w-11 items-center justify-center rounded-full transition-colors duration-200 ${
                active ? 'bg-brand-50 text-brand-600' : 'text-ink-400 group-hover:text-ink-700'
              }`}
            >
              <Icon active={active} />
            </span>
            <span className={active ? 'text-brand-600' : 'text-ink-500'}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
