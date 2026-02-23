const DEFAULT_WEIGHTS = {
  lexical: 0.45,
  quality: 0.25,
  recency: 0.2,
  citation: 0.1,
};

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'to',
  'with',
]);

const TYPE_QUALITY_SCORES = {
  'journal-article': 1,
  'article-journal': 1,
  article: 0.95,
  'proceedings-article': 0.8,
  'proceedings-paper': 0.8,
  'conference-paper': 0.8,
  'book-chapter': 0.75,
  book: 0.72,
  report: 0.7,
  preprint: 0.6,
};

function cleanText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenize(value) {
  const cleaned = cleanText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));

  return new Set(cleaned);
}

function overlapScore(left, right) {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) {
      overlap += 1;
    }
  }

  const denominator = Math.max(left.size, right.size);
  return denominator === 0 ? 0 : overlap / denominator;
}

function computeLexicalScore(claim, source) {
  const claimTokens = tokenize(claim);
  const titleTokens = tokenize(source.title || '');
  const abstractTokens = tokenize(source.abstractSnippet || '');

  const titleOverlap = overlapScore(claimTokens, titleTokens);
  const abstractOverlap = overlapScore(claimTokens, abstractTokens);

  const exactTitlePhraseBoost = cleanText(source.title || '').includes(
    cleanText(claim).slice(0, 80),
  )
    ? 0.08
    : 0;

  return Math.min(1, titleOverlap * 0.75 + abstractOverlap * 0.25 + exactTitlePhraseBoost);
}

function computeQualityScore(source) {
  const type = cleanText(source.sourceType || source.type || '');
  const base = TYPE_QUALITY_SCORES[type] ?? 0.55;
  const venueBoost = source.venue ? 0.12 : 0;
  const doiBoost = source.doi ? 0.08 : 0;
  return Math.min(1, base + venueBoost + doiBoost);
}

function computeRecencyScore(source, nowYear = new Date().getUTCFullYear()) {
  if (!Number.isInteger(source.year)) {
    return 0.35;
  }

  const age = Math.max(0, nowYear - source.year);

  if (age <= 2) {
    return 1;
  }

  if (age <= 5) {
    return 0.85;
  }

  if (age <= 10) {
    return 0.7;
  }

  if (age <= 20) {
    return 0.5;
  }

  return 0.3;
}

function computeCitationScore(source) {
  const citationCount = Number.isFinite(source.citationCount)
    ? Math.max(0, Number(source.citationCount))
    : 0;

  const maxReference = 1000;
  const normalized = Math.log10(citationCount + 1) / Math.log10(maxReference + 1);

  if (!Number.isFinite(normalized)) {
    return 0;
  }

  return Math.min(1, Math.max(0, normalized));
}

function buildWhyText(scores, source) {
  const reasons = [];

  if (scores.lexical >= 0.6) {
    reasons.push('strong topical match');
  } else if (scores.lexical >= 0.4) {
    reasons.push('moderate topical match');
  }

  if (scores.quality >= 0.8) {
    reasons.push('high-quality scholarly venue');
  }

  if (scores.recency >= 0.85 && Number.isInteger(source.year)) {
    reasons.push(`recent publication (${source.year})`);
  } else if (Number.isInteger(source.year)) {
    reasons.push(`published in ${source.year}`);
  }

  if (scores.citation >= 0.5 && Number.isFinite(source.citationCount)) {
    reasons.push(`well cited (${source.citationCount})`);
  }

  if (reasons.length === 0) {
    return 'relevant scholarly source candidate';
  }

  return reasons.join(', ');
}

function rankSources(claim, sources, options = {}) {
  const weights = {
    ...DEFAULT_WEIGHTS,
    ...(options.weights || {}),
  };

  return [...sources]
    .map((source) => {
      const lexical = computeLexicalScore(claim, source);
      const quality = computeQualityScore(source);
      const recency = computeRecencyScore(source, options.nowYear);
      const citation = computeCitationScore(source);

      const confidence =
        lexical * weights.lexical +
        quality * weights.quality +
        recency * weights.recency +
        citation * weights.citation;

      const boundedConfidence = Math.min(1, Math.max(0, confidence));

      return {
        ...source,
        scores: {
          lexical,
          quality,
          recency,
          citation,
        },
        confidence: Number(boundedConfidence.toFixed(4)),
        why: buildWhyText({ lexical, quality, recency, citation }, source),
      };
    })
    .sort((left, right) => right.confidence - left.confidence);
}

module.exports = {
  DEFAULT_WEIGHTS,
  rankSources,
  computeLexicalScore,
  computeQualityScore,
  computeRecencyScore,
  computeCitationScore,
};
