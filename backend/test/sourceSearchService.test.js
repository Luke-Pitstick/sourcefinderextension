const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSourceSearchService,
  dedupeSources,
} = require('../src/sourceSearchService');

function buildSource(overrides = {}) {
  return {
    id: overrides.id || 'source-id',
    provider: overrides.provider || 'openalex',
    title: overrides.title || 'Sample source title',
    url: overrides.url || 'https://example.com/source',
    doi: overrides.doi || null,
    authors: overrides.authors || [{ family: 'Doe', given: 'Jane' }],
    authorNames: overrides.authorNames || ['Jane Doe'],
    year: overrides.year ?? 2022,
    venue: overrides.venue || 'Journal of Testing',
    abstractSnippet: overrides.abstractSnippet || 'Sample abstract text',
    citationCount: overrides.citationCount ?? 12,
    sourceType: overrides.sourceType || 'journal-article',
  };
}

test('dedupeSources prefers higher citation count for duplicate DOI', () => {
  const sources = dedupeSources([
    buildSource({ id: 'a', doi: '10.1/abc', citationCount: 5 }),
    buildSource({ id: 'b', doi: '10.1/abc', citationCount: 50 }),
  ]);

  assert.equal(sources.length, 1);
  assert.equal(sources[0].id, 'b');
});

test('suggestSources triggers crossref fallback when openalex confidence is sparse', async () => {
  const service = createSourceSearchService({
    searchOpenAlex: async () => [
      buildSource({
        id: 'weak-openalex',
        title: 'Completely unrelated transportation paper',
        abstractSnippet: 'Focuses on bus lane scheduling.',
        citationCount: 1,
        year: 2001,
      }),
    ],
    searchCrossref: async () => [
      buildSource({
        id: 'crossref-good',
        provider: 'crossref',
        title: 'Physical activity and reduced cardiovascular mortality in adults',
        abstractSnippet:
          'Meta-analysis indicates physical activity reduces cardiovascular mortality risk.',
        citationCount: 250,
        year: 2021,
      }),
    ],
    logger: {
      warn() {},
    },
  });

  const claim =
    'Regular physical activity improves cardiovascular health outcomes in adults and reduces mortality risk.';
  const result = await service.suggestSources({
    claim,
    style: 'apa',
    maxResults: 5,
  });

  assert.equal(result.style, 'apa');
  assert.equal(result.diagnostics.fallbackUsed, true);
  assert.ok(result.suggestions.length >= 1);
  assert.equal(result.suggestions[0].id, 'crossref-good');
  assert.ok(result.suggestions[0].bibliographyCitation.length > 0);
  assert.ok(result.suggestions[0].inTextCitation.length > 0);
});

test('suggestSources validates claim length window', async () => {
  const service = createSourceSearchService({
    searchOpenAlex: async () => [],
    searchCrossref: async () => [],
  });

  await assert.rejects(
    () =>
      service.suggestSources({
        claim: 'Too short.',
        style: 'apa',
      }),
    /Claim length must be between/,
  );
});
