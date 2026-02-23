const OPEN_ALEX_BASE_URL = 'https://api.openalex.org/works';

function cleanText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\s+/g, ' ').trim();
}

function stripDoiPrefix(doiValue) {
  const cleaned = cleanText(doiValue).toLowerCase();
  if (!cleaned) {
    return '';
  }

  return cleaned
    .replace(/^https?:\/\/doi\.org\//, '')
    .replace(/^doi:/, '')
    .trim();
}

function reconstructAbstract(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== 'object') {
    return '';
  }

  const tokensByPosition = [];

  for (const [token, positions] of Object.entries(invertedIndex)) {
    if (!Array.isArray(positions)) {
      continue;
    }

    for (const position of positions) {
      if (!Number.isInteger(position) || position < 0) {
        continue;
      }

      tokensByPosition[position] = token;
    }
  }

  return cleanText(tokensByPosition.filter(Boolean).join(' '));
}

function parseAuthor(displayName) {
  const cleaned = cleanText(displayName);
  if (!cleaned) {
    return null;
  }

  if (cleaned.includes(',')) {
    const [familyPart, ...givenParts] = cleaned
      .split(',')
      .map((segment) => cleanText(segment))
      .filter(Boolean);

    if (!familyPart) {
      return null;
    }

    const given = cleanText(givenParts.join(' '));
    return given ? { family: familyPart, given } : { family: familyPart };
  }

  const segments = cleaned.split(' ').filter(Boolean);
  if (segments.length === 1) {
    return { literal: segments[0] };
  }

  const family = segments.pop();
  const given = cleanText(segments.join(' '));

  return given ? { family, given } : { family };
}

function chooseBestUrl(work) {
  const landingUrl = cleanText(work?.primary_location?.landing_page_url);
  if (landingUrl) {
    return landingUrl;
  }

  const doi = stripDoiPrefix(work?.doi);
  if (doi) {
    return `https://doi.org/${doi}`;
  }

  return cleanText(work?.id);
}

function chooseVenue(work) {
  return cleanText(
    work?.primary_location?.source?.display_name ||
      work?.host_venue?.display_name ||
      work?.primary_topic?.display_name,
  );
}

function normalizeWork(work) {
  const title = cleanText(work?.display_name || work?.title);
  const doi = stripDoiPrefix(work?.doi);
  const url = chooseBestUrl(work);
  const authorNames = Array.isArray(work?.authorships)
    ? work.authorships
        .map((authorship) => cleanText(authorship?.author?.display_name))
        .filter(Boolean)
    : [];

  const authors = authorNames.map(parseAuthor).filter(Boolean);
  const year = Number.isInteger(work?.publication_year)
    ? work.publication_year
    : null;

  return {
    id: cleanText(work?.id || doi || url || title),
    provider: 'openalex',
    title,
    url,
    doi: doi || null,
    authors,
    authorNames,
    year,
    venue: chooseVenue(work) || null,
    abstractSnippet: reconstructAbstract(work?.abstract_inverted_index) || null,
    citationCount: Number.isFinite(work?.cited_by_count)
      ? Number(work.cited_by_count)
      : 0,
    sourceType: cleanText(work?.type) || 'journal-article',
  };
}

function buildSearchUrl(query, limit, mailto) {
  const params = new URLSearchParams({
    search: query,
    'per-page': String(limit),
  });

  if (mailto) {
    params.set('mailto', mailto);
  }

  return `${OPEN_ALEX_BASE_URL}?${params.toString()}`;
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`OpenAlex request failed (HTTP ${response.status}).`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function searchOpenAlex(claim, options = {}) {
  const query = cleanText(claim);
  if (!query) {
    return [];
  }

  const limit = Number.isInteger(options.limit)
    ? Math.max(1, Math.min(options.limit, 25))
    : 10;
  const contactEmail = cleanText(options.contactEmail);
  const userAgent =
    cleanText(options.userAgent) ||
    'sourcefinderextension/1.0';

  const url = buildSearchUrl(query, limit, contactEmail);
  const payload = await fetchJsonWithTimeout(url, {
    headers: {
      accept: 'application/json',
      'user-agent': userAgent,
    },
  });

  const works = Array.isArray(payload?.results) ? payload.results : [];

  return works
    .map(normalizeWork)
    .filter((item) => item.title && item.url && item.id);
}

module.exports = {
  searchOpenAlex,
  reconstructAbstract,
};
