import { useEffect, useMemo, useRef, useState } from 'react';
import type { SourceSuggestion, SuggestionState } from '../types';

const DEFAULT_STATUS = 'Listening for claims...';

async function getActiveTabId(): Promise<number | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  return Number.isInteger(tabId) ? (tabId as number) : null;
}

async function copyText(value: string): Promise<string> {
  await navigator.clipboard.writeText(value);
  return 'Copied to clipboard.';
}

function confidenceLabel(confidence: number): string {
  const percent = Math.round(confidence * 100);

  if (percent >= 80) {
    return `High ${percent}%`;
  }

  if (percent >= 65) {
    return `Medium ${percent}%`;
  }

  return `Low ${percent}%`;
}

function confidenceClass(confidence: number): string {
  if (confidence >= 0.8) {
    return 'high';
  }

  if (confidence >= 0.65) {
    return 'medium';
  }

  return 'low';
}

function formatUpdatedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function panelState(status: SuggestionState['status'] | undefined): {
  label: string;
  tone: 'ready' | 'loading' | 'error' | 'idle';
} {
  if (status === 'loading') {
    return { label: 'Scanning', tone: 'loading' };
  }

  if (status === 'error') {
    return { label: 'Attention', tone: 'error' };
  }

  if (status === 'ready') {
    return { label: 'Ready', tone: 'ready' };
  }

  return { label: 'Standby', tone: 'idle' };
}

function SourceCard({
  suggestion,
  onCopied,
}: {
  suggestion: SourceSuggestion;
  onCopied: (message: string) => void;
}): JSX.Element {
  const authorLine =
    suggestion.authors.length > 0 ? suggestion.authors.join(', ') : 'Unknown authors';

  const venueLine = [suggestion.venue, suggestion.year].filter(Boolean).join(' • ') || 'Unknown venue';

  return (
    <article className="source-card">
      <header className="source-card-header">
        <p className={`confidence-pill ${confidenceClass(suggestion.confidence)}`}>
          {confidenceLabel(suggestion.confidence)}
        </p>
        <h3>{suggestion.title}</h3>
        <div className="source-metadata">
          <p className="source-meta">{authorLine}</p>
          <p className="source-meta muted">{venueLine}</p>
        </div>
      </header>

      {suggestion.why ? <p className="why">Why: {suggestion.why}</p> : null}

      {suggestion.abstractSnippet ? (
        <p className="abstract">{suggestion.abstractSnippet.slice(0, 260)}</p>
      ) : null}

      <div className="actions">
        <button
          type="button"
          onClick={() => {
            void copyText(suggestion.inTextCitation).then(onCopied);
          }}
        >
          Copy In-Text
        </button>
        <button
          type="button"
          onClick={() => {
            void copyText(suggestion.bibliographyCitation).then(onCopied);
          }}
        >
          Copy Reference
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            void chrome.tabs.create({ url: suggestion.url });
          }}
        >
          Open Source
        </button>
      </div>
    </article>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}): JSX.Element {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      <p>{description}</p>
    </div>
  );
}

export function App(): JSX.Element {
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [state, setState] = useState<SuggestionState | null>(null);
  const [statusMessage, setStatusMessage] = useState(DEFAULT_STATUS);
  const [manualLookupPending, setManualLookupPending] = useState(false);
  const portRef = useRef<chrome.runtime.Port | null>(null);

  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'SIDEPANEL' });
    portRef.current = port;

    const onPortMessage = (message: { type?: string; payload?: SuggestionState }) => {
      if (message.type !== 'SUGGESTIONS_UPDATED' || !message.payload) {
        return;
      }

      if (activeTabId !== null && message.payload.tabId !== activeTabId) {
        return;
      }

      setState(message.payload);
    };

    port.onMessage.addListener(onPortMessage);

    return () => {
      port.onMessage.removeListener(onPortMessage);
      port.disconnect();
      portRef.current = null;
    };
  }, [activeTabId]);

  useEffect(() => {
    const refresh = async () => {
      const tabId = await getActiveTabId();
      setActiveTabId(tabId);

      if (tabId === null) {
        setState(null);
        return;
      }

      portRef.current?.postMessage({
        type: 'SUBSCRIBE_TAB',
        tabId,
      });

      const payload = (await chrome.runtime.sendMessage({
        type: 'GET_TAB_STATE',
        tabId,
      })) as SuggestionState;

      if (payload) {
        setState(payload);
      }
    };

    void refresh();

    const onActivated = () => {
      void refresh();
    };

    const onUpdated = (tabId: number, changeInfo: { status?: string }) => {
      if (changeInfo.status === 'complete' && tabId === activeTabId) {
        void refresh();
      }
    };

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);

    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [activeTabId]);

  const topStatus = useMemo(() => {
    if (!state) {
      return 'Open Google Docs or Word web to start.';
    }

    if (state.status === 'loading') {
      return 'Searching for supporting sources...';
    }

    if (state.status === 'error') {
      return state.error || 'Could not load source suggestions.';
    }

    if (state.status === 'ready' && state.suggestions.length === 0) {
      return 'No confident sources found for the latest claim.';
    }

    if (state.status === 'ready') {
      return `Found ${state.suggestions.length} sources for the latest claim.`;
    }

    if (state.status === 'idle' && state.error) {
      return state.error;
    }

    return statusMessage;
  }, [state, statusMessage]);

  const hasContent = state?.status === 'ready' && state.suggestions.length > 0;
  const stateIndicator = panelState(state?.status);

  const runManualLookup = async () => {
    if (activeTabId === null) {
      setStatusMessage('Open a Docs or Word tab first.');
      return;
    }

    setManualLookupPending(true);

    try {
      const response = (await chrome.runtime.sendMessage({
        type: 'TRIGGER_MANUAL_LOOKUP',
        tabId: activeTabId,
      })) as { ok?: boolean; error?: string } | undefined;

      if (!response?.ok) {
        setStatusMessage(response?.error || 'Could not start manual lookup.');
        return;
      }

      setStatusMessage('Manual lookup requested. Highlight a sentence if needed.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not start manual lookup.');
    } finally {
      setManualLookupPending(false);
      window.setTimeout(() => {
        setStatusMessage(DEFAULT_STATUS);
      }, 1800);
    }
  };

  return (
    <main className="panel-root">
      <header className="panel-hero">
        <div className="hero-top">
          <p className="eyebrow">Source Finder</p>
          <p className={`state-chip ${stateIndicator.tone}`}>{stateIndicator.label}</p>
        </div>
        <h1>Claim Support Console</h1>
        <p className="status-line">{topStatus}</p>
        {state?.claim ? (
          <p className="claim-line">
            <span>Claim</span>
            {state.claim}
          </p>
        ) : null}
        {state?.updatedAt ? (
          <div className="meta-row">
            {state.site ? <p className="meta-pill">{state.site}</p> : null}
            <p className="meta-pill">Updated {formatUpdatedAt(state.updatedAt)}</p>
          </div>
        ) : null}
      </header>

      <section className="control-row">
        <button
          type="button"
          className="control primary"
          onClick={() => {
            void runManualLookup();
          }}
          disabled={activeTabId === null || manualLookupPending}
        >
          {manualLookupPending ? (
            <>
              <span className="button-spinner" aria-hidden="true" />
              Requesting...
            </>
          ) : (
            'Lookup Selected Text'
          )}
        </button>
        <button
          type="button"
          className="control ghost-control"
          onClick={() => {
            void chrome.runtime.openOptionsPage();
          }}
        >
          Options
        </button>
      </section>

      {state?.status === 'loading' ? (
        <div className="loading-banner" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <p>Searching OpenAlex and Crossref...</p>
        </div>
      ) : null}

      {state?.status === 'error' ? (
        <div className="error-state" role="status" aria-live="polite">
          <p>{state.error || 'Could not load source suggestions.'}</p>
        </div>
      ) : null}

      {state?.status === 'loading' ? (
        <div className="loading-stack" aria-hidden="true">
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ) : null}

      {hasContent ? (
        <section className="source-grid">
          {state.suggestions.map((suggestion) => (
            <SourceCard
              key={suggestion.id}
              suggestion={suggestion}
              onCopied={(message) => {
                setStatusMessage(message);
                window.setTimeout(() => {
                  setStatusMessage(DEFAULT_STATUS);
                }, 1500);
              }}
            />
          ))}
        </section>
      ) : null}

      {state?.status === 'ready' && state.suggestions.length === 0 ? (
        <EmptyState
          title="No strong matches yet"
          description="Try a longer sentence or use Lookup Selected Text."
        />
      ) : null}

      {state?.status === 'idle' || !state ? (
        <EmptyState
          title="Waiting for a claim"
          description="Type a sentence ending with punctuation, or highlight one and click Lookup Selected Text."
        />
      ) : null}
    </main>
  );
}
