import Link from 'next/link';
import { ButtonLink } from '@/components/ui';

/** A loosely-sketched permanent signboard: the one motif the whole product is about. */
function SignMark() {
  return (
    <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden="true">
      <rect x="14" y="30" width="92" height="66" rx="6" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <path d="M30 30V20a6 6 0 0 1 6-6h48a6 6 0 0 1 6 6v10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="28" y="44" width="18" height="18" rx="2" fill="currentColor" opacity="0.14" />
      <rect x="28" y="44" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M52 48h30M52 56h30M52 64h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <path d="M28 76h60" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      <circle cx="60" cy="108" r="3" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

const POINTS = [
  {
    title: 'Permanent by design',
    body: 'The address never changes, even if you rename your shop or swap your menu. Print the code once.',
  },
  {
    title: 'Built for one phone',
    body: 'Update prices, post an offer, or check who called — all from the same device you already carry.',
  },
  {
    title: 'No app for your customers',
    body: 'A scan opens a real page in their browser. Nothing to install, nothing to sign up for.',
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-4 py-5">
        <span className="font-display text-[18px] font-semibold tracking-tight">Merchant Platform</span>
        <Link href="/login" className="text-[14px] font-medium text-ink-600 transition-colors hover:text-brand-700">
          Merchant sign in
        </Link>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:pt-12">
        <section className="grid items-center gap-10 sm:grid-cols-[1.1fr_0.9fr]">
          <div className="rise-in">
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-brand-700">
              One code. One address. Forever.
            </p>
            <h1 className="mt-3 text-balance font-display text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-[42px]">
              A permanent digital address for every local shop.
            </h1>
            <p className="mt-4 max-w-md text-[16px] leading-relaxed text-ink-500">
              Print one QR code and stick it on your door or counter. Change your hours, prices or
              offers whenever you like — the code behind it never has to be reprinted.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <ButtonLink href="/login" className="px-6">
                Set up your page
              </ButtonLink>
              <ButtonLink href="/m/sharma-hair-salon" variant="secondary" target="_blank" rel="noopener" className="px-6">
                See a live example
              </ButtonLink>
            </div>
          </div>

          <div className="rise-in rise-in-2 mx-auto aspect-square w-full max-w-[260px] text-brand-600/70 sm:max-w-[300px]">
            <SignMark />
          </div>
        </section>

        <section className="mt-16 grid gap-4 sm:mt-24 sm:grid-cols-3">
          {POINTS.map((point, i) => (
            <div key={point.title} className={`card card-interactive rise-in p-5 ${i === 1 ? 'rise-in-2' : i === 2 ? 'rise-in-3' : ''}`}>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 font-display text-[14px] font-semibold text-brand-700">
                {i + 1}
              </span>
              <h2 className="mt-3 text-[16px] font-semibold">{point.title}</h2>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-500">{point.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="mx-auto max-w-4xl px-4 pb-10 text-[13px] text-ink-400">
        <p>Made for shops that run on a phone, not a dashboard.</p>
      </footer>
    </div>
  );
}
