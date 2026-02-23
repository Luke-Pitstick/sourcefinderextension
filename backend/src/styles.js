const STYLE_OPTIONS = [
  { id: 'apa', template: 'apa', label: 'APA (7th Edition)' },
  { id: 'mla', template: 'mla', label: 'MLA (9th Edition)' },
  {
    id: 'chicago',
    template: 'chicago-author-date',
    label: 'Chicago (Author-Date)',
  },
  { id: 'ieee', template: 'ieee', label: 'IEEE' },
  { id: 'harvard', template: 'harvard1', label: 'Harvard' },
  { id: 'vancouver', template: 'vancouver', label: 'Vancouver' },
];

const STYLE_ALIASES = {
  apa: 'apa',
  mla: 'mla',
  chicago: 'chicago',
  'chicago-author-date': 'chicago',
  ieee: 'ieee',
  harvard: 'harvard',
  harvard1: 'harvard',
  vancouver: 'vancouver',
};

const STYLES_BY_ID = new Map(STYLE_OPTIONS.map((style) => [style.id, style]));

function resolveStyle(input) {
  const requested = String(input || 'apa').trim().toLowerCase();
  const canonicalId = STYLE_ALIASES[requested];

  if (!canonicalId) {
    const validStyles = STYLE_OPTIONS.map((style) => style.id).join(', ');
    throw new Error(`Unsupported style "${input}". Try one of: ${validStyles}.`);
  }

  return STYLES_BY_ID.get(canonicalId);
}

module.exports = {
  STYLE_OPTIONS,
  resolveStyle,
};
