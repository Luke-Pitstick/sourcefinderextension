import { describe, expect, it } from 'vitest';
import { extractSentenceFromText, isAssertiveSentence } from '../content/textExtraction';

describe('textExtraction heuristics', () => {
  it('returns the latest completed sentence', () => {
    const value =
      'Physical activity improves cardiovascular health in adults. In 2014 Russia invaded Crimea.';
    expect(extractSentenceFromText(value)).toBe('In 2014 Russia invaded Crimea.');
  });

  it('accepts a valid past-tense claim sentence', () => {
    expect(isAssertiveSentence('In 2014 Russia invaded Crimea.')).toBe(true);
  });

  it('rejects sentences without ending punctuation', () => {
    expect(isAssertiveSentence('In 2014 Russia invaded Crimea')).toBe(false);
  });

  it('rejects claims that are too short to be meaningful', () => {
    expect(isAssertiveSentence('Russia invaded.')).toBe(false);
  });
});
