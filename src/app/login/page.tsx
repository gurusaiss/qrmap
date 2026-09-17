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
      <h1 className="text-[22px] font-bold tracking-tight">Sign in</h1>
      <p className="mt-1 text-[15px] text-ink-500">Manage your shop page from your phone.</p>
      <LoginForm />
    </main>
  );
}
