import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'QRShop',
    short_name: 'QRShop',
    description: 'A permanent digital address for every local business.',
    start_url: '/app',
    display: 'standalone',
    background_color: '#fbf6ec',
    theme_color: '#c2491d',
    icons: [{ src: '/icon', sizes: '32x32', type: 'image/png' }],
  };
}
