import type { EditorAdapter } from '../types';
import {
  cleanText,
  extractSentenceFromText,
  isAssertiveSentence,
  selectionText,
  sentenceFromActiveElement,
} from './textExtraction';

function sentenceFromDocsClipboard(rootDocument: Document): string {
  const clipboardInput = rootDocument.querySelector(
    'textarea.kix-clipboard-input',
  ) as HTMLTextAreaElement | null;

  if (!clipboardInput) {
    return '';
  }

  return extractSentenceFromText(clipboardInput.value || '');
}

export class DocsAdapter implements EditorAdapter {
  site: EditorAdapter['site'] = 'google-docs';

  private cleanup: Array<() => void> = [];

  private onClaim: ((claim: string) => void) | null = null;

  start(onClaim: (claim: string) => void): void {
    this.onClaim = onClaim;
    this.attachDocumentListeners(document);

    const observer = new MutationObserver(() => {
      const iframes = Array.from(document.querySelectorAll('iframe'));
      for (const iframe of iframes) {
        try {
          const frameDoc = iframe.contentDocument;
          if (frameDoc) {
            this.attachDocumentListeners(frameDoc);
          }
        } catch {
          // Cross-origin frames are ignored.
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    this.cleanup.push(() => observer.disconnect());
  }

  getSelectedText(): string {
    const mainSelection = selectionText(document);
    if (mainSelection) {
      return mainSelection;
    }

    const frameSelections = Array.from(document.querySelectorAll('iframe'))
      .map((iframe) => {
        try {
          return selectionText(iframe.contentDocument as Document);
        } catch {
          return '';
        }
      })
      .filter(Boolean);

    return frameSelections[0] || '';
  }

  destroy(): void {
    for (const dispose of this.cleanup) {
      dispose();
    }

    this.cleanup = [];
    this.onClaim = null;
  }

  private attachDocumentListeners(rootDocument: Document): void {
    if ((rootDocument as Document & { __sourceFinderBound?: boolean }).__sourceFinderBound) {
      return;
    }

    (rootDocument as Document & { __sourceFinderBound?: boolean }).__sourceFinderBound = true;

    const handler = () => {
      const sentence = this.extractClaimCandidate(rootDocument);
      if (sentence && this.onClaim) {
        this.onClaim(sentence);
      }
    };

    const events: Array<keyof DocumentEventMap> = [
      'keyup',
      'input',
      'compositionend',
      'mouseup',
    ];

    for (const eventName of events) {
      rootDocument.addEventListener(eventName, handler, true);
    }

    this.cleanup.push(() => {
      for (const eventName of events) {
        rootDocument.removeEventListener(eventName, handler, true);
      }
    });
  }

  private extractClaimCandidate(rootDocument: Document): string {
    const selection = selectionText(rootDocument);
    const fromSelection = extractSentenceFromText(selection);
    if (isAssertiveSentence(fromSelection)) {
      return cleanText(fromSelection);
    }

    const fromActive = sentenceFromActiveElement(rootDocument);
    if (isAssertiveSentence(fromActive)) {
      return cleanText(fromActive);
    }

    const fromClipboard = sentenceFromDocsClipboard(rootDocument);
    if (isAssertiveSentence(fromClipboard)) {
      return cleanText(fromClipboard);
    }

    return '';
  }
}
