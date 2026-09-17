import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-bold">We couldn&apos;t find that business</h1>
      <p className="mt-3 text-[15px] text-ink-500">
        The address you scanned or typed does not match a business on this platform. Please check the
        code and try again.
      </p>
      <Link href="/" className="tap-target mt-6 inline-flex items-center rounded-lg border border-ink-200 px-5 font-semibold">
        Go to the home page
      </Link>
    </main>
  );
}
