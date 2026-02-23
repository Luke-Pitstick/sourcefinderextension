const test = require('node:test');
const assert = require('node:assert/strict');

const { formatCitationFromCslEntry } = require('../src/citationService');

const STYLE_IDS = ['apa', 'mla', 'chicago', 'ieee', 'harvard', 'vancouver'];

const sampleEntry = {
  id: '10.1000/example-doi',
  type: 'article-journal',
  title: 'Sample evidence for citation formatting',
  author: [
    {
      family: 'Doe',
      given: 'Jane',
    },
  ],
  issued: {
    'date-parts': [[2022]],
  },
  'container-title': 'Journal of Citation Tests',
  DOI: '10.1000/example-doi',
  URL: 'https://doi.org/10.1000/example-doi',
};

test('formatCitationFromCslEntry supports all configured styles', () => {
  for (const style of STYLE_IDS) {
    const result = formatCitationFromCslEntry(sampleEntry, style);

    assert.equal(result.style, style);
    assert.ok(result.styleLabel.length > 0);
    assert.ok(result.bibliographyCitation.length > 0);

    if (style === 'ieee' || style === 'vancouver') {
      assert.equal(result.inTextCitation, '[1]');
    } else {
      assert.ok(result.inTextCitation.length > 0);
    }
  }
});
