import Link from 'next/link';
import { requirePlatform } from '@/modules/auth/session-server';
import { logoutAction } from '../login/actions';

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/admin', label: 'Merchants' },
  { href: '/admin/merchants/new', label: 'New merchant' },
];

/** Desktop-first: this console is used at a desk, unlike the merchant dashboard. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { principal } = await requirePlatform();

  return (
    <div className="mx-auto min-h-screen max-w-5xl">
      <header className="flex items-center justify-between border-b border-ink-200 bg-white px-6 py-4">
        <div className="flex items-center gap-6">
          <span className="font-bold">Platform Admin</span>
          <nav className="flex gap-4 text-[14px] font-medium">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="text-ink-700 hover:text-ink-900">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-[13px] text-ink-500">
          <span className="capitalize">{principal.role.replace('_', ' ')}</span>
          <form action={logoutAction}>
            <button type="submit" className="tap-target rounded-lg px-3 font-medium text-ink-500">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="px-6 py-6">{children}</main>
    </div>
  );
}
