const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeCitationScore,
  computeRecencyScore,
  rankSources,
} = require('../src/ranking/sourceRanker');

test('computeRecencyScore rewards newer papers', () => {
  const recent = computeRecencyScore({ year: 2025 }, 2026);
  const old = computeRecencyScore({ year: 1998 }, 2026);

  assert.ok(recent > old);
});

test('computeCitationScore increases with citation count', () => {
  const low = computeCitationScore({ citationCount: 3 });
  const high = computeCitationScore({ citationCount: 2000 });

  assert.ok(high > low);
  assert.ok(high <= 1);
});

test('rankSources orders by confidence descending', () => {
  const claim =
    'Regular physical activity improves cardiovascular health outcomes in adults and reduces mortality risk.';

  const ranked = rankSources(claim, [
    {
      id: 'a',
      title: 'Cardiovascular outcomes from regular physical activity in adults',
      abstractSnippet:
        'This study shows that regular activity improves cardiovascular outcomes and mortality.',
      year: 2023,
      venue: 'Journal of Cardiology',
      sourceType: 'journal-article',
      citationCount: 180,
    },
    {
      id: 'b',
      title: 'Urban mobility policy report',
      abstractSnippet: 'Summary of transportation policy and zoning changes.',
      year: 2004,
      venue: '',
      sourceType: 'report',
      citationCount: 2,
    },
  ]);

  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].id, 'a');
  assert.ok(ranked[0].confidence >= ranked[1].confidence);
  assert.ok(typeof ranked[0].why === 'string' && ranked[0].why.length > 0);
});
