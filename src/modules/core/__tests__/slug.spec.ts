import { describe, expect, it } from 'vitest';
import { normalizeSlugInput, slugifyBusinessName, validateSlug } from '../slug';

describe('normalizeSlugInput', () => {
  it('lowercases and turns spaces into hyphens', () => {
    expect(normalizeSlugInput('Ram Bakery')).toBe('ram-bakery');
  });

  it('strips punctuation a human would naturally type, like an apostrophe', () => {
    // Regression: typing a business-name-shaped value into the "web address"
    // field (e.g. "Ram's Bakery") used to be rejected outright with a raw
    // "Invalid slug: invalid_characters" error, instead of being cleaned up
    // the same way an auto-suggested slug already is.
    expect(normalizeSlugInput("Ram's Bakery")).toBe('ram-s-bakery');
    expect(validateSlug(normalizeSlugInput("Ram's Bakery"))).toBeNull();
  });

  it('collapses repeated punctuation into a single hyphen, never a double hyphen', () => {
    expect(normalizeSlugInput('Ram -- Bakery!!')).toBe('ram-bakery');
  });

  it('trims a leading or trailing hyphen left over after stripping punctuation', () => {
    expect(normalizeSlugInput('-Ram Bakery-')).toBe('ram-bakery');
  });

  it('is idempotent on an already-valid slug', () => {
    expect(normalizeSlugInput('ram-bakery')).toBe('ram-bakery');
  });

  it('spells out "&" as "and" rather than dropping it silently', () => {
    expect(normalizeSlugInput('Ram & Sons')).toBe('ram-and-sons');
  });
});

describe('slugifyBusinessName', () => {
  it('always produces a slug that passes validateSlug', () => {
    expect(validateSlug(slugifyBusinessName("Ram's Bakery"))).toBeNull();
    expect(validateSlug(slugifyBusinessName('A'))).toBeNull();
    expect(validateSlug(slugifyBusinessName('!!!'))).toBeNull();
  });
});
