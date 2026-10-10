'use client';

import { useMemo, useState } from 'react';
import { ButtonLink, Field, Input, Select } from '@/components/ui';

/**
 * Colour presets only — no "add your logo" option. The QR module
 * (src/modules/qr/index.ts) does not actually composite a logo image into
 * the code; `withLogo` there only raises the error-correction level. Offering
 * a logo toggle here would be a button that implies something the backend
 * doesn't do, which is exactly the kind of gap this pass is meant to close.
 */
// Every preset is verified below (in the test file) to actually clear the
// server's 7:1 contrast bar - the brand blue used elsewhere in the UI
// (#1D4ED8) measures only ~6.7:1 on white and would be rejected if offered
// here, which is exactly the kind of "preset that doesn't really work" this
// pass exists to catch.
const PRESETS = [
  { name: 'Classic black', fg: '#000000', bg: '#FFFFFF' },
  { name: 'Navy', fg: '#0B2463', bg: '#FFFFFF' },
  { name: 'Forest', fg: '#0F5C2C', bg: '#FFFFFF' },
  { name: 'Charcoal', fg: '#1F2937', bg: '#F3F4F6' },
];

/**
 * Same WCAG relative-luminance contrast formula as the server
 * (src/modules/qr/index.ts `contrastRatio`) so a merchant sees a warning
 * here instead of silently getting a 400 from the download link.
 */
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function luminance(c: { r: number; g: number; b: number }): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

function contrastRatio(a: string, b: string): number | null {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return null;
  const la = luminance(ca);
  const lb = luminance(cb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function QrCustomizer({ slug }: { slug: string }) {
  const [fg, setFg] = useState('#000000');
  const [bg, setBg] = useState('#FFFFFF');
  const [preset, setPreset] = useState('Classic black');

  const ratio = useMemo(() => contrastRatio(fg, bg), [fg, bg]);
  const fgDarker = useMemo(() => {
    const a = parseHex(fg);
    const b = parseHex(bg);
    return a && b ? luminance(a) <= luminance(b) : true;
  }, [fg, bg]);
  const scannable = ratio !== null && ratio >= 7 && fgDarker;

  const query = `fg=${encodeURIComponent(fg)}&bg=${encodeURIComponent(bg)}`;

  return (
    <div className="card p-4">
      <h2 className="font-semibold">Colour</h2>
      <p className="mt-1 text-[13px] text-ink-500">
        Keep strong contrast — codes that fail this check won&apos;t scan reliably, so we block them
        the same way here as when you download.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Style">
          <Select
            value={preset}
            onChange={(e) => {
              const p = PRESETS.find((x) => x.name === e.target.value);
              setPreset(e.target.value);
              if (p) {
                setFg(p.fg);
                setBg(p.bg);
              }
            }}
          >
            {PRESETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
            <option value="custom">Custom</option>
          </Select>
        </Field>
        <div />
        <Field label="Code colour">
          <Input
            type="color"
            value={fg}
            onChange={(e) => {
              setFg(e.target.value);
              setPreset('custom');
            }}
            className="h-11 p-1"
          />
        </Field>
        <Field label="Background">
          <Input
            type="color"
            value={bg}
            onChange={(e) => {
              setBg(e.target.value);
              setPreset('custom');
            }}
            className="h-11 p-1"
          />
        </Field>
      </div>

      {!scannable && (
        <p className="mt-3 rounded-lg bg-warning-50 px-3 py-2 text-[13px] text-warning-600">
          Not enough contrast between the code and its background — this combination is blocked to
          avoid printing a code that won&apos;t scan. Choose a darker code colour or a lighter
          background.
        </p>
      )}

      {scannable && (
        <>
          <div className="mt-4 flex justify-center">
            <img
              src={`/api/qr/${slug}.png?size=400&${query}`}
              alt="QR code preview with your chosen colours"
              width={160}
              height={160}
              className="rounded-lg border border-ink-200"
            />
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <ButtonLink href={`/api/qr/${slug}.png?size=1600&${query}`} variant="secondary" download>
              Download PNG
            </ButtonLink>
            <ButtonLink href={`/api/qr/${slug}.svg?${query}`} variant="secondary" download>
              Download SVG
            </ButtonLink>
          </div>
        </>
      )}
    </div>
  );
}
