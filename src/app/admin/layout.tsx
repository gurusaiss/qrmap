import { requirePlatform } from '@/modules/auth/session-server';
import { logoutAction } from '../login/actions';
import { AdminNav } from './admin-nav';

export const dynamic = 'force-dynamic';

/** Desktop-first: this console is used at a desk, unlike the merchant dashboard. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { principal } = await requirePlatform();

  return (
    <div className="mx-auto min-h-screen max-w-5xl">
      <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-6 py-4">
        <div className="flex items-center gap-6">
          <span className="font-display text-[17px] font-semibold">Platform Admin</span>
          <AdminNav />
        </div>
        <div className="flex items-center gap-3 text-[13px] text-ink-500">
          <span className="rounded-full bg-ink-100 px-2.5 py-0.5 font-medium capitalize text-ink-700">
            {principal.role.replace('_', ' ')}
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="tap-target rounded-[var(--radius-sm)] px-3 font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-700"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="px-6 py-6">{children}</main>
    </div>
  );
}
