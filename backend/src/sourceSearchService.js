const { formatCitationFromCslEntry } = require('./citationService');
const { searchOpenAlex } = require('./providers/openAlexProvider');
const { searchCrossref } = require('./providers/crossrefProvider');
const { rankSources } = require('./ranking/sourceRanker');
const { resolveStyle } = require('./styles');
const {
  CLAIM_MIN_LENGTH,
  CLAIM_MAX_LENGTH,
  cleanClaimText,
  isLengthAllowed,
  isLikelyClaim,
} = require('./utils/claimHeuristics');

const DEFAULT_CONFIDENCE_THRESHOLD = 0.55;
const FALLBACK_TRIGGER_COUNT = 3;

function cleanText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\s+/g, ' ').trim();
}

function normalizeTitle(title) {
  return cleanText(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function sourceDedupeKey(source) {
  if (source?.doi) {
    return `doi:${cleanText(source.doi).toLowerCase()}`;
  }

  const normalizedTitle = normalizeTitle(source?.title || '');
  if (normalizedTitle) {
    return `title:${normalizedTitle}`;
  }

  return `id:${cleanText(source?.id || '')}`;
}

function dedupeSources(sources) {
  const dedupedMap = new Map();

  for (const source of sources) {
    const key = sourceDedupeKey(source);
    if (!key || key.endsWith(':')) {
      continue;
    }

    if (!dedupedMap.has(key)) {
      dedupedMap.set(key, source);
      continue;
    }

    const existing = dedupedMap.get(key);
    const existingCitationCount = Number(existing?.citationCount || 0);
    const candidateCitationCount = Number(source?.citationCount || 0);

    if (candidateCitationCount > existingCitationCount) {
      dedupedMap.set(key, source);
    }
  }

  return [...dedupedMap.values()];
}

function inferCslType(sourceType) {
  const normalized = cleanText(sourceType).toLowerCase();

  if (normalized.includes('journal')) {
    return 'article-journal';
  }

  if (normalized.includes('conference') || normalized.includes('proceedings')) {
    return 'paper-conference';
  }

  if (normalized.includes('book')) {
    return 'book';
  }

  if (normalized.includes('chapter')) {
    return 'chapter';
  }

  if (normalized.includes('report')) {
    return 'report';
  }

  return 'article';
}

function normalizeAuthors(authors, authorNames) {
  if (Array.isArray(authors) && authors.length > 0) {
    return authors;
  }

  if (!Array.isArray(authorNames)) {
    return [];
  }

  return authorNames
    .map((name) => {
      const cleaned = cleanText(name);
      if (!cleaned) {
        return null;
      }

      const segments = cleaned.split(' ').filter(Boolean);
      if (segments.length === 1) {
        return { literal: segments[0] };
      }

      const family = segments.pop();
      const given = cleanText(segments.join(' '));

      return given ? { family, given } : { family };
    })
    .filter(Boolean);
}

function toCslEntry(source) {
  const id = cleanText(source.id || source.doi || source.url || source.title);
  const now = new Date();

  const entry = {
    id,
    type: inferCslType(source.sourceType),
    title: cleanText(source.title),
    URL: cleanText(source.url),
    accessed: {
      'date-parts': [
        [
          now.getUTCFullYear(),
          now.getUTCMonth() + 1,
          now.getUTCDate(),
        ],
      ],
    },
  };

  const authors = normalizeAuthors(source.authors, source.authorNames);
  if (authors.length > 0) {
    entry.author = authors;
  }

  if (source.venue) {
    entry['container-title'] = source.venue;
  }

  if (Number.isInteger(source.year)) {
    entry.issued = {
      'date-parts': [[source.year]],
    };
  }

  if (source.doi) {
    entry.DOI = source.doi;
  }

  return entry;
}

function serializeSuggestion(source, style) {
  const cslEntry = toCslEntry(source);
  const formatted = formatCitationFromCslEntry(cslEntry, style);

  return {
    id: source.id,
    title: source.title,
    url: source.url,
    doi: source.doi || null,
    authors: Array.isArray(source.authorNames) ? source.authorNames : [],
    year: Number.isInteger(source.year) ? source.year : null,
    venue: source.venue || null,
    abstractSnippet: source.abstractSnippet || null,
    confidence: source.confidence,
    why: source.why,
    inTextCitation: formatted.inTextCitation,
    bibliographyCitation: formatted.bibliographyCitation,
  };
}

function createSourceSearchService(overrides = {}) {
  const searchOpenAlexImpl = overrides.searchOpenAlex || searchOpenAlex;
  const searchCrossrefImpl = overrides.searchCrossref || searchCrossref;
  const logger = overrides.logger || console;

  return {
    async suggestSources(input = {}) {
      const claim = cleanClaimText(input.claim);
      const requestedStyle = cleanText(input.style || 'apa').toLowerCase() || 'apa';
      const resolvedStyle = resolveStyle(requestedStyle);
      const style = resolvedStyle.id;
      const maxResults = Number.isInteger(input.maxResults)
        ? Math.max(1, Math.min(input.maxResults, 10))
        : 5;
      const threshold = Number.isFinite(input.threshold)
        ? Number(input.threshold)
        : DEFAULT_CONFIDENCE_THRESHOLD;

      if (!claim) {
        throw new Error('A claim is required.');
      }

      if (!isLengthAllowed(claim)) {
        throw new Error(
          `Claim length must be between ${CLAIM_MIN_LENGTH} and ${CLAIM_MAX_LENGTH} characters.`,
        );
      }

      const contactEmail = cleanText(process.env.SOURCEFINDER_CONTACT_EMAIL);
      const userAgent =
        cleanText(process.env.SOURCEFINDER_USER_AGENT) ||
        'sourcefinderextension/1.0';

      const diagnostics = {
        openAlexMs: 0,
        crossrefMs: 0,
        openAlexCount: 0,
        crossrefCount: 0,
        fallbackUsed: false,
        droppedLowConfidence: 0,
        lowConfidenceThreshold: threshold,
        likelyClaim: isLikelyClaim(claim),
      };

      const openAlexStart = Date.now();
      let openAlexResults = [];
      try {
        openAlexResults = await searchOpenAlexImpl(claim, {
          limit: 10,
          contactEmail,
          userAgent,
        });
      } catch (error) {
        logger.warn?.(`OpenAlex search failed: ${error.message}`);
      }
      diagnostics.openAlexMs = Date.now() - openAlexStart;
      diagnostics.openAlexCount = openAlexResults.length;

      let ranked = rankSources(claim, dedupeSources(openAlexResults));
      const confidentOpenAlexResults = ranked.filter(
        (item) => item.confidence >= threshold,
      );

      if (confidentOpenAlexResults.length < FALLBACK_TRIGGER_COUNT) {
        diagnostics.fallbackUsed = true;

        const crossrefStart = Date.now();
        let crossrefResults = [];

        try {
          crossrefResults = await searchCrossrefImpl(claim, {
            limit: 10,
            contactEmail,
            userAgent,
          });
        } catch (error) {
          logger.warn?.(`Crossref search failed: ${error.message}`);
        }

        diagnostics.crossrefMs = Date.now() - crossrefStart;
        diagnostics.crossrefCount = crossrefResults.length;

        ranked = rankSources(claim, dedupeSources([...openAlexResults, ...crossrefResults]));
      }

      const filtered = ranked.filter((item) => item.confidence >= threshold);
      diagnostics.droppedLowConfidence = Math.max(0, ranked.length - filtered.length);

      const suggestions = filtered.slice(0, maxResults).map((source) => {
        try {
          return serializeSuggestion(source, style);
        } catch (error) {
          logger.warn?.(`Citation rendering failed for source "${source.title}": ${error.message}`);
          return null;
        }
      }).filter(Boolean);

      return {
        claim,
        style,
        suggestions,
        diagnostics,
      };
    },
  };
}

module.exports = {
  DEFAULT_CONFIDENCE_THRESHOLD,
  createSourceSearchService,
  dedupeSources,
  toCslEntry,
};
