const fs = require('node:fs');
const path = require('node:path');

const cheerio = require('cheerio');
const Cite = require('citation-js');

const { resolveStyle } = require('./styles');

const CUSTOM_STYLE_FILES = [
  { template: 'mla', file: 'modern-language-association.csl' },
  { template: 'chicago-author-date', file: 'chicago-author-date.csl' },
  { template: 'ieee', file: 'ieee.csl' },
];

let customStylesRegistered = false;

function registerCustomStyles() {
  if (customStylesRegistered) {
    return;
  }

  const config = Cite.plugins.config.get('@csl');
  const existingTemplates = new Set(config.templates.list());

  for (const customStyle of CUSTOM_STYLE_FILES) {
    if (existingTemplates.has(customStyle.template)) {
      continue;
    }

    const templatePath = path.join(
      __dirname,
      '..',
      'csl-styles',
      customStyle.file,
    );
    const templateXml = fs.readFileSync(templatePath, 'utf8');

    config.templates.add(customStyle.template, templateXml);
  }

  customStylesRegistered = true;
}

function cleanText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\s+/g, ' ').trim();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) {
      return cleaned;
    }
  }

  return '';
}

function toAbsoluteUrl(baseUrl, maybeRelativeUrl) {
  if (!maybeRelativeUrl) {
    return '';
  }

  try {
    return new URL(maybeRelativeUrl, baseUrl).toString();
  } catch {
    return '';
  }
}

function websiteNameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function parseAuthor(name) {
  const cleanedName = cleanText(name);
  if (!cleanedName) {
    return null;
  }

  if (cleanedName.includes(',')) {
    const [family, ...givenParts] = cleanedName
      .split(',')
      .map((part) => cleanText(part))
      .filter(Boolean);

    if (!family) {
      return null;
    }

    const given = givenParts.join(' ').trim();
    return given ? { family, given } : { family };
  }

  const segments = cleanedName.split(' ').map((part) => part.trim()).filter(Boolean);

  if (segments.length === 1) {
    return { literal: segments[0] };
  }

  const family = segments.pop();
  const given = segments.join(' ');

  return given ? { family, given } : { family };
}

function parseAuthors(authorText) {
  const cleanedAuthorText = cleanText(authorText).replace(/^by\s+/i, '');
  if (!cleanedAuthorText) {
    return [];
  }

  const chunks = cleanedAuthorText
    .split(/\s*;\s*|\s+and\s+|\s+&\s+/i)
    .map((part) => cleanText(part))
    .filter(Boolean);

  const names = chunks.length > 0 ? chunks : [cleanedAuthorText];

  return names.map(parseAuthor).filter(Boolean);
}

function parseDateParts(rawDate) {
  const cleanedDate = cleanText(rawDate);
  if (!cleanedDate) {
    return null;
  }

  const dateMatch = cleanedDate.match(/^(\d{4})(?:[-/](\d{1,2}))?(?:[-/](\d{1,2}))?/);

  if (dateMatch) {
    const year = Number.parseInt(dateMatch[1], 10);
    const month = dateMatch[2] ? Number.parseInt(dateMatch[2], 10) : null;
    const day = dateMatch[3] ? Number.parseInt(dateMatch[3], 10) : null;

    const dateParts = [year];
    if (Number.isInteger(month) && month >= 1 && month <= 12) {
      dateParts.push(month);

      if (Number.isInteger(day) && day >= 1 && day <= 31) {
        dateParts.push(day);
      }
    }

    return dateParts;
  }

  const parsedDate = new Date(cleanedDate);

  if (Number.isNaN(parsedDate.valueOf())) {
    return null;
  }

  return [
    parsedDate.getUTCFullYear(),
    parsedDate.getUTCMonth() + 1,
    parsedDate.getUTCDate(),
  ];
}

function normalizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('A URL is required.');
  }

  const trimmed = rawUrl.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    return new URL(withProtocol).toString();
  } catch {
    throw new Error(`Invalid URL: "${rawUrl}".`);
  }
}

async function fetchPageMetadata(rawUrl) {
  const normalizedUrl = normalizeUrl(rawUrl);

  const response = await fetch(normalizedUrl, {
    redirect: 'follow',
    headers: {
      'user-agent':
        'sourcefinderextension/1.0',
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL (HTTP ${response.status}).`);
  }

  const contentType = response.headers.get('content-type') || '';
  const finalUrl = response.url || normalizedUrl;
  if (
    !contentType.includes('text/html') &&
    !contentType.includes('application/xhtml+xml')
  ) {
    return {
      title: '',
      authorText: '',
      publishedText: '',
      siteName: websiteNameFromUrl(finalUrl),
      canonicalUrl: finalUrl,
      finalUrl,
      requestedUrl: normalizedUrl,
    };
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const title = firstNonEmpty(
    $('meta[property="og:title"]').first().attr('content'),
    $('meta[name="twitter:title"]').first().attr('content'),
    $('meta[name="title"]').first().attr('content'),
    $('title').first().text(),
  );

  const authorText = firstNonEmpty(
    $('meta[name="author"]').first().attr('content'),
    $('meta[property="article:author"]').first().attr('content'),
    $('meta[name="parsely-author"]').first().attr('content'),
    $('meta[name="dc.creator"]').first().attr('content'),
    $('meta[itemprop="author"]').first().attr('content'),
  );

  const publishedText = firstNonEmpty(
    $('meta[property="article:published_time"]').first().attr('content'),
    $('meta[name="publish-date"]').first().attr('content'),
    $('meta[name="pubdate"]').first().attr('content'),
    $('meta[name="date"]').first().attr('content'),
    $('meta[itemprop="datePublished"]').first().attr('content'),
    $('time[datetime]').first().attr('datetime'),
  );

  const siteName = firstNonEmpty(
    $('meta[property="og:site_name"]').first().attr('content'),
    $('meta[name="application-name"]').first().attr('content'),
    websiteNameFromUrl(finalUrl),
  );

  const canonicalUrl = firstNonEmpty(
    toAbsoluteUrl(finalUrl, $('link[rel="canonical"]').first().attr('href')),
    finalUrl,
  );

  return {
    title,
    authorText,
    publishedText,
    siteName,
    canonicalUrl,
    finalUrl,
    requestedUrl: normalizedUrl,
  };
}

function buildCslEntry(metadata) {
  const now = new Date();
  const entry = {
    id: metadata.canonicalUrl,
    type: 'webpage',
    URL: metadata.canonicalUrl,
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

  if (metadata.title) {
    entry.title = metadata.title;
  }

  if (!entry.title) {
    entry.title = metadata.siteName || metadata.canonicalUrl;
  }

  const authors = parseAuthors(metadata.authorText);
  if (authors.length > 0) {
    entry.author = authors;
  }

  const issuedDateParts = parseDateParts(metadata.publishedText);
  if (issuedDateParts) {
    entry.issued = {
      'date-parts': [issuedDateParts],
    };
  }

  if (metadata.siteName) {
    entry['container-title'] = metadata.siteName;
  }

  return entry;
}

function formatBibliographyFromEntries(entries, styleInput) {
  registerCustomStyles();

  const style = resolveStyle(styleInput);
  const cite = new Cite(entries);
  const citation = cite
    .format('bibliography', {
      format: 'text',
      template: style.template,
      lang: 'en-US',
    })
    .trim();

  return {
    style,
    citation,
  };
}

function formatInTextFromEntries(entries, styleInput) {
  registerCustomStyles();

  const style = resolveStyle(styleInput);

  if (style.id === 'ieee' || style.id === 'vancouver') {
    return {
      style,
      citation: '[1]',
    };
  }

  const cite = new Cite(entries);
  const citation = cite
    .format('citation', {
      format: 'text',
      template: style.template,
      lang: 'en-US',
    })
    .trim();

  return {
    style,
    citation,
  };
}

function formatCitationFromCslEntry(cslEntry, styleInput) {
  const bibliography = formatBibliographyFromEntries([cslEntry], styleInput);
  const inText = formatInTextFromEntries([cslEntry], styleInput);

  return {
    style: bibliography.style.id,
    styleLabel: bibliography.style.label,
    bibliographyCitation: bibliography.citation,
    inTextCitation: inText.citation,
  };
}

async function generateCitationFromUrl(rawUrl, styleInput) {
  const metadata = await fetchPageMetadata(rawUrl);
  const cslEntry = buildCslEntry(metadata);
  const formatted = formatCitationFromCslEntry(cslEntry, styleInput);

  return {
    style: formatted.style,
    styleLabel: formatted.styleLabel,
    citation: formatted.bibliographyCitation,
    metadata,
  };
}

module.exports = {
  generateCitationFromUrl,
  formatCitationFromCslEntry,
  formatBibliographyFromEntries,
  formatInTextFromEntries,
};
