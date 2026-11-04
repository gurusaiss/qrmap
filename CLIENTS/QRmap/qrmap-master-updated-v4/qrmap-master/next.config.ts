import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Self-contained build output for the Dockerfile - no host-proprietary
  // deploy target required (see docs/03-ARCHITECTURE.md §C9).
  output: 'standalone',
  // tesseract.js (native WASM worker) and @tesseract.js-data/eng (ships a
  // .gz binary, not JS) must run via plain Node require at runtime - the
  // bundler has no loader for a worker thread or a .gz file and fails the
  // build trying to trace them in. pdf-parse is kept dynamic-imported
  // instead (see import/extract.ts) specifically so it doesn't need to be
  // listed here.
  serverExternalPackages: ['postgres', 'sharp', 'tesseract.js', '@tesseract.js-data/eng'],
  images: { formats: ['image/avif', 'image/webp'] },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

export default config;
