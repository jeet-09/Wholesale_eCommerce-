import { describe, expect, it } from 'vitest';

import { durationToMs, expiryFromNow } from '../duration';

describe('durationToMs', () => {
  it('parses each supported unit', () => {
    expect(durationToMs('45s')).toBe(45_000);
    expect(durationToMs('15m')).toBe(15 * 60_000);
    expect(durationToMs('12h')).toBe(12 * 60 * 60_000);
    expect(durationToMs('30d')).toBe(30 * 24 * 60 * 60_000);
    expect(durationToMs('2w')).toBe(2 * 7 * 24 * 60 * 60_000);
  });

  it('tolerates surrounding whitespace', () => {
    expect(durationToMs(' 1m ')).toBe(60_000);
  });

  it('throws on invalid input', () => {
    expect(() => durationToMs('')).toThrow();
    expect(() => durationToMs('10x')).toThrow();
    expect(() => durationToMs('abc')).toThrow();
  });
});

describe('expiryFromNow', () => {
  it('adds the duration to the base date', () => {
    const base = new Date('2026-01-01T00:00:00.000Z');
    expect(expiryFromNow('15m', base).toISOString()).toBe('2026-01-01T00:15:00.000Z');
  });
});
