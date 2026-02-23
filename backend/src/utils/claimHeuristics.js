const CLAIM_MIN_LENGTH = 25;
const CLAIM_MAX_LENGTH = 280;

const COMMON_VERBS = [
  'is',
  'are',
  'was',
  'were',
  'be',
  'have',
  'has',
  'had',
  'show',
  'shows',
  'suggest',
  'suggests',
  'demonstrate',
  'demonstrates',
  'indicate',
  'indicates',
  'increase',
  'increases',
  'decrease',
  'decreases',
  'improve',
  'improves',
  'reduce',
  'reduces',
  'cause',
  'causes',
  'correlate',
  'correlates',
  'predict',
  'predicts',
];

function cleanClaimText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\s+/g, ' ').trim();
}

function hasPunctuationBoundary(text) {
  return /[.!?;:]$/.test(text);
}

function hasVerb(text) {
  const lower = text.toLowerCase();
  return COMMON_VERBS.some((verb) => new RegExp(`\\b${verb}\\b`, 'i').test(lower));
}

function isLengthAllowed(text) {
  return text.length >= CLAIM_MIN_LENGTH && text.length <= CLAIM_MAX_LENGTH;
}

function isLikelyClaim(text) {
  const cleaned = cleanClaimText(text);

  if (!cleaned || !isLengthAllowed(cleaned)) {
    return false;
  }

  return hasVerb(cleaned) && hasPunctuationBoundary(cleaned);
}

module.exports = {
  CLAIM_MIN_LENGTH,
  CLAIM_MAX_LENGTH,
  cleanClaimText,
  hasPunctuationBoundary,
  hasVerb,
  isLengthAllowed,
  isLikelyClaim,
};
