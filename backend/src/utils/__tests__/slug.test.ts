import { describe, expect, it } from 'vitest';

import { slugify } from '../slug';

describe('slugify', () => {
  it('lowercases and hyphenates words', () => {
    expect(slugify('Fresh Vegetables')).toBe('fresh-vegetables');
  });

  it('strips diacritics and punctuation', () => {
    expect(slugify('  Héllo Wörld!! ')).toBe('hello-world');
    expect(slugify('A/B & C')).toBe('a-b-c');
  });

  it('trims leading/trailing separators', () => {
    expect(slugify('--Spaces--')).toBe('spaces');
  });

  it('caps length at 80 characters', () => {
    const slug = slugify('a'.repeat(200));
    expect(slug.length).toBeLessThanOrEqual(80);
  });
});
