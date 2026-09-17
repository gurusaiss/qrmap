import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Merchant Platform</h1>
      <p className="mt-3 text-ink-500">
        A permanent digital address for every local business. Print the code once; change what is
        behind it whenever you like.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/login" className="tap-target inline-flex items-center rounded-lg bg-brand-600 px-5 text-white font-semibold">
          Merchant sign in
        </Link>
        <Link href="/m/sharma-hair-salon" className="tap-target inline-flex items-center rounded-lg border border-ink-200 bg-white px-5 font-semibold">
          See an example page
        </Link>
      </div>
    </main>
  );
}
