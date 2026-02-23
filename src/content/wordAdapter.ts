import type { EditorAdapter } from '../types';
import {
  cleanText,
  extractSentenceFromText,
  isAssertiveSentence,
  selectionText,
  sentenceFromActiveElement,
} from './textExtraction';

export class WordAdapter implements EditorAdapter {
  site: EditorAdapter['site'] = 'word-web';

  private cleanup: Array<() => void> = [];

  private onClaim: ((claim: string) => void) | null = null;

  start(onClaim: (claim: string) => void): void {
    this.onClaim = onClaim;

    const handler = () => {
      const candidate = this.extractClaimCandidate(document);
      if (candidate && this.onClaim) {
        this.onClaim(candidate);
      }
    };

    const events: Array<keyof DocumentEventMap> = [
      'keyup',
      'input',
      'compositionend',
      'mouseup',
    ];

    for (const eventName of events) {
      document.addEventListener(eventName, handler, true);
    }

    this.cleanup.push(() => {
      for (const eventName of events) {
        document.removeEventListener(eventName, handler, true);
      }
    });
  }

  getSelectedText(): string {
    return selectionText(document);
  }

  destroy(): void {
    for (const dispose of this.cleanup) {
      dispose();
    }

    this.cleanup = [];
    this.onClaim = null;
  }

  private extractClaimCandidate(rootDocument: Document): string {
    const selected = selectionText(rootDocument);
    const sentenceFromSelection = extractSentenceFromText(selected);
    if (isAssertiveSentence(sentenceFromSelection)) {
      return cleanText(sentenceFromSelection);
    }

    const sentenceFromActive = sentenceFromActiveElement(rootDocument);
    if (isAssertiveSentence(sentenceFromActive)) {
      return cleanText(sentenceFromActive);
    }

    return '';
  }
}
