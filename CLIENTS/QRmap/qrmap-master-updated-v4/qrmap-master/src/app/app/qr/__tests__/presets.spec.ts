import { describe, expect, it } from 'vitest';
import { assertScannableColours, DEFAULT_STYLE } from '@/modules/qr';

/**
 * Keep this list in sync with PRESETS in ../qr-customizer.tsx by hand (it is
 * a client component and can't be imported directly into a Node test
 * environment). The point of this test is narrow but important: every preset
 * offered in the UI must pass the SAME contrast check the server enforces,
 * or a merchant can pick a preset from the dropdown and get a rejected
 * download — a dead button. This caught exactly that bug once already
 * (the "Navy" and "Forest" presets originally used the brand colours
 * directly, which measure ~6.7:1 and ~5.0:1 on white - both below the 7:1 bar).
 */
const PRESETS = [
  { name: 'Classic black', fg: '#000000', bg: '#FFFFFF' },
  { name: 'Navy', fg: '#0B2463', bg: '#FFFFFF' },
  { name: 'Forest', fg: '#0F5C2C', bg: '#FFFFFF' },
  { name: 'Charcoal', fg: '#1F2937', bg: '#F3F4F6' },
];

describe('QR colour presets', () => {
  it.each(PRESETS)('"$name" ($fg on $bg) passes the server contrast check', ({ fg, bg }) => {
    expect(() => assertScannableColours({ ...DEFAULT_STYLE, foreground: fg, background: bg })).not.toThrow();
  });
});
