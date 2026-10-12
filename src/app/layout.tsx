import type { Metadata, Viewport } from 'next';
import { Source_Serif_4 } from 'next/font/google';
import './globals.css';

/**
 * Self-hosted at build time (next/font downloads once during `next build` and
 * serves it from our own origin - no third-party request at runtime, no
 * layout-shift flash, fully cached). Used for headings only, across the
 * dashboard/admin/login/home. The public merchant page never loads this: it
 * is a separate hand-rendered Route Handler outside this layout entirely, and
 * deliberately stays on system fonts only (docs/03-ARCHITECTURE.md §F).
 */
const displaySerif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
  display: 'swap',
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
