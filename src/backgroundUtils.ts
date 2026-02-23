import type { ClaimMode, CitationStyle } from './types';

export const AUTO_MIN_LENGTH = 25;
export const AUTO_MAX_LENGTH = 280;
export const MANUAL_MIN_LENGTH = 20;

export function normalizeClaim(claim: string): string {
  return claim.replace(/\s+/g, ' ').trim();
}

export function claimLengthAllowed(claim: string, mode: ClaimMode): boolean {
  const min = mode === 'manual' ? MANUAL_MIN_LENGTH : AUTO_MIN_LENGTH;
  return claim.length >= min && claim.length <= AUTO_MAX_LENGTH;
}

export function minimumClaimLength(mode: ClaimMode): number {
  return mode === 'manual' ? MANUAL_MIN_LENGTH : AUTO_MIN_LENGTH;
}

export function createCacheKey(
  claim: string,
  style: CitationStyle,
  maxResults: number,
): string {
  return `${style}::${maxResults}::${claim.toLowerCase()}`;
}

export function shouldSkipCandidate(
  claim: string,
  mode: ClaimMode,
  previousClaim: string,
): boolean {
  if (!claimLengthAllowed(claim, mode)) {
    return true;
  }

  if (mode === 'auto' && claim === previousClaim) {
    return true;
  }

  return false;
}
