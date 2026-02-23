import { describe, expect, it } from 'vitest';
import {
  AUTO_MAX_LENGTH,
  AUTO_MIN_LENGTH,
  claimLengthAllowed,
  createCacheKey,
  normalizeClaim,
  shouldSkipCandidate,
} from '../backgroundUtils';

describe('backgroundUtils', () => {
  it('normalizes whitespace in claims', () => {
    expect(normalizeClaim('A   claim\nwith\tspace.')).toBe('A claim with space.');
  });

  it('enforces auto claim length range', () => {
    expect(claimLengthAllowed('x'.repeat(AUTO_MIN_LENGTH), 'auto')).toBe(true);
    expect(claimLengthAllowed('x'.repeat(AUTO_MAX_LENGTH + 1), 'auto')).toBe(false);
  });

  it('skips repeated auto candidates', () => {
    const claim = 'This sentence is long enough to pass and should be reused once.';
    expect(shouldSkipCandidate(claim, 'auto', claim)).toBe(true);
    expect(shouldSkipCandidate(claim, 'manual', claim)).toBe(false);
  });

  it('builds deterministic cache keys', () => {
    expect(createCacheKey('Claim', 'apa', 5)).toBe('apa::5::claim');
  });
});
