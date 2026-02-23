export type CitationStyle =
  | 'apa'
  | 'mla'
  | 'chicago'
  | 'ieee'
  | 'harvard'
  | 'vancouver';

export type EditorSite = 'google-docs' | 'word-web';
export type ClaimMode = 'auto' | 'manual';

export interface SourceSuggestion {
  id: string;
  title: string;
  url: string;
  doi: string | null;
  authors: string[];
  year: number | null;
  venue: string | null;
  abstractSnippet: string | null;
  confidence: number;
  why: string;
  inTextCitation: string;
  bibliographyCitation: string;
}

export interface SuggestionState {
  tabId: number;
  status: 'idle' | 'loading' | 'ready' | 'error';
  claim: string;
  site: EditorSite | null;
  suggestions: SourceSuggestion[];
  error: string | null;
  requestId: number;
  updatedAt: number;
}

export interface ExtensionSettings {
  apiBaseUrl: string;
  style: CitationStyle;
  debounceMs: number;
  maxResults: number;
  debugMode: boolean;
}

export interface ClaimCandidateMessage {
  type: 'CLAIM_CANDIDATE';
  claim: string;
  site: EditorSite;
  mode: ClaimMode;
}

export interface ManualLookupRequestMessage {
  type: 'MANUAL_LOOKUP_REQUEST';
}

export interface ContentScriptPingMessage {
  type: 'PING_CONTENT_SCRIPT';
}

export interface ManualLookupEmptyMessage {
  type: 'MANUAL_LOOKUP_EMPTY';
  site: EditorSite;
}

export interface GetTabStateMessage {
  type: 'GET_TAB_STATE';
  tabId: number;
}

export interface TriggerManualLookupMessage {
  type: 'TRIGGER_MANUAL_LOOKUP';
  tabId?: number;
}

export interface SubscribeTabMessage {
  type: 'SUBSCRIBE_TAB';
  tabId: number;
}

export interface SuggestionsUpdatedMessage {
  type: 'SUGGESTIONS_UPDATED';
  payload: SuggestionState;
}

export type RuntimeMessage =
  | ClaimCandidateMessage
  | ManualLookupRequestMessage
  | ContentScriptPingMessage
  | ManualLookupEmptyMessage
  | GetTabStateMessage
  | TriggerManualLookupMessage
  | SubscribeTabMessage
  | SuggestionsUpdatedMessage;

export interface EditorAdapter {
  site: EditorSite;
  start(onClaim: (claim: string) => void): void;
  getSelectedText(): string;
  destroy(): void;
}
