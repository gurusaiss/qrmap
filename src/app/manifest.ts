import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Merchant Platform',
    short_name: 'Merchant',
    description: 'A permanent digital address for every local business.',
    start_url: '/app',
    display: 'standalone',
    background_color: '#f7f9fb',
    theme_color: '#1D4ED8',
    icons: [{ src: '/icon', sizes: '32x32', type: 'image/png' }],
  };
}
