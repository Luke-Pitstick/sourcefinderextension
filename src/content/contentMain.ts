import type {
  ClaimCandidateMessage,
  ContentScriptPingMessage,
  EditorAdapter,
  ManualLookupEmptyMessage,
  ManualLookupRequestMessage,
} from '../types';
import { DocsAdapter } from './docsAdapter';
import { cleanText, extractSentenceFromText } from './textExtraction';
import { WordAdapter } from './wordAdapter';

declare global {
  interface Window {
    __sourceFinderContentBooted?: boolean;
  }
}

function createAdapterForLocation(): EditorAdapter | null {
  const host = window.location.hostname;

  if (host === 'docs.google.com') {
    return new DocsAdapter();
  }

  if (host === 'word.office.com') {
    return new WordAdapter();
  }

  return null;
}

function postClaimCandidate(adapter: EditorAdapter, claim: string, mode: 'auto' | 'manual'): void {
  const message: ClaimCandidateMessage = {
    type: 'CLAIM_CANDIDATE',
    claim,
    mode,
    site: adapter.site,
  };

  void chrome.runtime.sendMessage(message);
}

function deriveManualClaim(adapter: EditorAdapter): string {
  const selected = cleanText(adapter.getSelectedText());
  if (!selected) {
    return '';
  }

  const extracted = extractSentenceFromText(selected);
  return cleanText(extracted || selected);
}

const adapter = createAdapterForLocation();

if (adapter && !window.__sourceFinderContentBooted) {
  window.__sourceFinderContentBooted = true;

  adapter.start((claim) => {
    postClaimCandidate(adapter, cleanText(claim), 'auto');
  });

  chrome.runtime.onMessage.addListener(
    (
      message: ManualLookupRequestMessage | ContentScriptPingMessage,
      _sender,
      sendResponse,
    ) => {
      if (!message) {
        return;
      }

      if (message.type === 'PING_CONTENT_SCRIPT') {
        sendResponse({ ok: true });
        return;
      }

      if (message.type !== 'MANUAL_LOOKUP_REQUEST') {
        return;
      }

      const claim = deriveManualClaim(adapter);
      if (!claim) {
        const emptySelectionMessage: ManualLookupEmptyMessage = {
          type: 'MANUAL_LOOKUP_EMPTY',
          site: adapter.site,
        };
        void chrome.runtime.sendMessage(emptySelectionMessage);
        sendResponse({ ok: false, empty: true });
        return;
      }

      postClaimCandidate(adapter, claim, 'manual');
      sendResponse({ ok: true });
    },
  );

  window.addEventListener('beforeunload', () => {
    adapter.destroy();
  });
}
