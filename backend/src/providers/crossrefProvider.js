const CROSSREF_BASE_URL = 'https://api.crossref.org/works';

function cleanText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\s+/g, ' ').trim();
}

function stripMarkup(text) {
  return cleanText(text.replace(/<[^>]+>/g, ' '));
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

function parseAuthor(author) {
  if (!author || typeof author !== 'object') {
    return null;
  }

  const family = cleanText(author.family);
  const given = cleanText(author.given);
  const literal = cleanText(author.name);

  if (family && given) {
    return { family, given };
  }

  if (family) {
    return { family };
  }

  if (literal) {
    return { literal };
  }

  return null;
}

function authorDisplayName(author) {
  const family = cleanText(author?.family);
  const given = cleanText(author?.given);
  const literal = cleanText(author?.name);

  if (family && given) {
    return `${given} ${family}`;
  }

  if (family) {
    return family;
  }

  return literal;
}

function inferYear(item) {
  const dateCandidates = [
    item?.issued?.['date-parts'],
    item?.published?.['date-parts'],
    item?.published_print?.['date-parts'],
    item?.published_online?.['date-parts'],
    item?.created?.['date-parts'],
  ];

  for (const candidate of dateCandidates) {
    const first = Array.isArray(candidate) && Array.isArray(candidate[0]) ? candidate[0][0] : null;
    if (Number.isInteger(first)) {
      return first;
    }
  }

  return null;
}

function normalizeItem(item) {
  const doi = stripDoiPrefix(item?.DOI);
  const title = cleanText(Array.isArray(item?.title) ? item.title[0] : '');
  const url = cleanText(item?.URL || (doi ? `https://doi.org/${doi}` : ''));
  const authorsRaw = Array.isArray(item?.author) ? item.author : [];
  const authors = authorsRaw.map(parseAuthor).filter(Boolean);
  const authorNames = authorsRaw.map(authorDisplayName).filter(Boolean);
  const venue = cleanText(
    Array.isArray(item?.['container-title']) ? item['container-title'][0] : '',
  );

  return {
    id: cleanText(doi || item?.URL || item?.DOI || title),
    provider: 'crossref',
    title,
    url,
    doi: doi || null,
    authors,
    authorNames,
    year: inferYear(item),
    venue: venue || null,
    abstractSnippet: item?.abstract ? stripMarkup(item.abstract) : null,
    citationCount: Number.isFinite(item?.['is-referenced-by-count'])
      ? Number(item['is-referenced-by-count'])
      : 0,
    sourceType: cleanText(item?.type) || 'journal-article',
  };
}

function buildSearchUrl(query, limit, mailto) {
  const params = new URLSearchParams({
    'query.bibliographic': query,
    rows: String(limit),
    sort: 'relevance',
    order: 'desc',
  });

  if (mailto) {
    params.set('mailto', mailto);
  }

  return `${CROSSREF_BASE_URL}?${params.toString()}`;
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
      throw new Error(`Crossref request failed (HTTP ${response.status}).`);
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function searchCrossref(claim, options = {}) {
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

  const items = Array.isArray(payload?.message?.items) ? payload.message.items : [];

  return items
    .map(normalizeItem)
    .filter((item) => item.title && item.url && item.id);
}

module.exports = {
  searchCrossref,
};
