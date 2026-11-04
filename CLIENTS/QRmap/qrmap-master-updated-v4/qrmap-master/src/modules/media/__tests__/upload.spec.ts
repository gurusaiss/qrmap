import { describe, expect, it } from 'vitest';
import { pickVariant, sniffImageType } from '../upload';

describe('pickVariant', () => {
  it('prefers the smallest variant that is at least the requested width', () => {
    const variants = { webp_400: 'a', webp_800: 'b', webp_1600: 'c' };
    expect(pickVariant(variants, 'webp', 500)).toBe('b');
  });

  it('falls back to the largest smaller variant when nothing at or above the request exists', () => {
    // A source image narrower than 800px never gets an 800 or 1600 variant.
    const variants = { webp_400: 'only-one' };
    expect(pickVariant(variants, 'webp', 800)).toBe('only-one');
    expect(pickVariant(variants, 'webp', 1600)).toBe('only-one');
  });

  it('does not give up just because the exact matching tier is missing', () => {
    // Regression: an earlier version stopped looking once it found ANY width
    // >= the request, even if that width's key was absent, instead of
    // continuing to try smaller widths that do exist.
    const variants = { webp_400: 'small' };
    expect(pickVariant(variants, 'webp', 400)).toBe('small');
  });

  it('returns null when the format was never generated at all', () => {
    expect(pickVariant({ webp_400: 'x' }, 'avif', 400)).toBeNull();
  });
});

describe('sniffImageType', () => {
  it('identifies real magic bytes regardless of claimed extension', () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('jpeg');
    expect(
      sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])),
    ).toBe('png');
  });

  it('rejects a file with no recognizable image header', () => {
    expect(sniffImageType(Buffer.from('not an image, just text here'))).toBeNull();
  });

  it('rejects a buffer too short to contain any magic bytes', () => {
    expect(sniffImageType(Buffer.from([1, 2, 3]))).toBeNull();
  });
});
