import { redirect } from 'next/navigation';
import { currentPrincipal } from '@/modules/auth/session-server';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const principal = await currentPrincipal();
  if (principal.kind === 'merchant') redirect('/app');
  if (principal.kind === 'platform') redirect('/admin');

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="rise-in">
        <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-brand-50 font-display text-[16px] font-semibold text-brand-700">
          Q
        </span>
        <h1 className="font-display text-[24px] font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-[15px] text-ink-500">Manage your shop page from your phone.</p>
      </div>
      <LoginForm />
    </main>
  );
}
