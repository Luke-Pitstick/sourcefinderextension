const ASSERTIVE_VERBS = [
  'is',
  'are',
  'was',
  'were',
  'be',
  'has',
  'have',
  'had',
  'did',
  'does',
  'do',
  'shows',
  'show',
  'suggests',
  'suggest',
  'demonstrates',
  'demonstrate',
  'indicates',
  'indicate',
  'states',
  'state',
  'reports',
  'report',
  'finds',
  'find',
  'found',
  'supports',
  'support',
  'causes',
  'cause',
  'correlates',
  'correlate',
  'improves',
  'improve',
  'reduces',
  'reduce',
  'increases',
  'increase',
  'invades',
  'invaded',
];

const MIN_ASSERTIVE_WORDS = 4;

function tokenizeWords(value: string): string[] {
  const matches = value.toLowerCase().match(/[a-z']+/g);
  return matches || [];
}

function hasVerbSignal(words: string[]): boolean {
  if (words.some((word) => ASSERTIVE_VERBS.includes(word))) {
    return true;
  }

  return words.some((word) => {
    if (word.length < 4) {
      return false;
    }

    // Lightweight fallback for regular verb inflections: "invaded", "increases".
    if (/(ed|ing)$/.test(word)) {
      return true;
    }

    if (word.endsWith('s') && !word.endsWith('ss') && word.length >= 5) {
      return true;
    }

    return false;
  });
}

export function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function extractSentenceFromText(rawText: string): string {
  const text = cleanText(rawText);
  if (!text) {
    return '';
  }

  const parts = text.split(/(?<=[.!?;:])\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '';
  }

  const last = cleanText(parts[parts.length - 1]);
  const previous = parts.length > 1 ? cleanText(parts[parts.length - 2]) : '';

  if (/[.!?;:]$/.test(last)) {
    return last;
  }

  return previous;
}

export function isAssertiveSentence(sentence: string): boolean {
  const cleaned = cleanText(sentence);
  if (!cleaned || !/[.!?;:]$/.test(cleaned)) {
    return false;
  }

  const words = tokenizeWords(cleaned);
  if (words.length < MIN_ASSERTIVE_WORDS) {
    return false;
  }

  return hasVerbSignal(words);
}

function sentenceFromInputElement(element: HTMLInputElement | HTMLTextAreaElement): string {
  const cursorIndex = element.selectionStart ?? element.value.length;
  const beforeCursor = element.value.slice(0, cursorIndex);
  return extractSentenceFromText(beforeCursor);
}

function sentenceFromContentEditable(element: HTMLElement): string {
  const selection = element.ownerDocument.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return '';
  }

  const range = selection.getRangeAt(0).cloneRange();
  range.setStart(element, 0);

  const textBeforeCursor = range.toString();
  return extractSentenceFromText(textBeforeCursor || element.textContent || '');
}

export function sentenceFromActiveElement(rootDocument: Document): string {
  const activeElement = rootDocument.activeElement as HTMLElement | null;
  if (!activeElement) {
    return '';
  }

  if (
    activeElement instanceof HTMLTextAreaElement ||
    (activeElement instanceof HTMLInputElement && activeElement.type === 'text')
  ) {
    return sentenceFromInputElement(activeElement);
  }

  if (activeElement.isContentEditable) {
    return sentenceFromContentEditable(activeElement);
  }

  return '';
}

export function selectionText(rootDocument: Document): string {
  const selection = rootDocument.getSelection();
  if (!selection) {
    return '';
  }

  return cleanText(selection.toString());
}
