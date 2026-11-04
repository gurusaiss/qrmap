import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

/**
 * Bundled in the repo (src/app/fonts, SIL OFL licence alongside) rather than
 * fetched from Google at build time: `next build` must work inside Docker, CI
 * and behind proxies with no outbound access to fonts.googleapis.com. Used for
 * headings only, across the dashboard/admin/login/home. The public merchant
 * page never loads this: it is a separate hand-rendered Route Handler outside
 * this layout entirely, and deliberately stays on system fonts only
 * (docs/03-ARCHITECTURE.md §F).
 */
const displaySerif = localFont({
  src: [
    { path: './fonts/source-serif-4-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/source-serif-4-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
  fallback: ['Georgia', 'serif'],
});

export const metadata: Metadata = {
  title: { default: 'QRmap', template: '%s · QRmap' },
  description: 'A permanent digital address for every local business.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={displaySerif.variable}>
      <body>{children}</body>
    </html>
  );
}
