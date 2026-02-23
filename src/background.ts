import {
  claimLengthAllowed,
  createCacheKey,
  minimumClaimLength,
  normalizeClaim,
} from './backgroundUtils';
import { DEFAULT_SETTINGS, getSettings } from './shared/storage';
import type {
  ClaimCandidateMessage,
  ClaimMode,
  EditorSite,
  ManualLookupEmptyMessage,
  SourceSuggestion,
  SubscribeTabMessage,
  TriggerManualLookupMessage,
  SuggestionState,
} from './types';

const CACHE_TTL_MS = 2 * 60 * 1000;
const CONTENT_SCRIPT_FILE = 'assets/contentMain.js';

interface PendingLookup {
  claim: string;
  mode: ClaimMode;
  site: EditorSite;
}

interface CacheEntry {
  suggestions: SourceSuggestion[];
  expiresAt: number;
}

const tabStateMap = new Map<number, SuggestionState>();
const debounceTimers = new Map<number, number>();
const pendingLookups = new Map<number, PendingLookup>();
const inFlightControllers = new Map<number, AbortController>();
const cache = new Map<string, CacheEntry>();
const subscriberPorts = new Map<number, Set<chrome.runtime.Port>>();

function errorMessage(value: unknown): string {
  if (value instanceof Error && value.message) {
    return value.message;
  }

  if (typeof value === 'string') {
    return value;
  }

  return '';
}

function isMissingReceiverError(value: unknown): boolean {
  const message = errorMessage(value);
  return (
    message.includes('Receiving end does not exist') ||
    message.includes('Could not establish connection') ||
    message.includes('The message port closed before a response was received') ||
    message.includes('message channel closed before a response was received')
  );
}

function isSupportedEditorUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  return (
    url.startsWith('https://docs.google.com/document/') ||
    url.startsWith('https://word.office.com/')
  );
}

function toLookupErrorMessage(error: unknown): string {
  const message = errorMessage(error);
  if (!message) {
    return 'Could not trigger manual lookup on this page.';
  }

  if (
    message.includes('Cannot access contents of url') ||
    message.includes('Missing host permission')
  ) {
    return 'Grant Source Finder site access for docs.google.com/word.office.com in extension details.';
  }

  return message;
}

function isClaimCandidateMessage(value: unknown): value is ClaimCandidateMessage {
  const typed = value as ClaimCandidateMessage;

  return (
    Boolean(typed) &&
    typed.type === 'CLAIM_CANDIDATE' &&
    typeof typed.claim === 'string' &&
    (typed.mode === 'auto' || typed.mode === 'manual') &&
    (typed.site === 'google-docs' || typed.site === 'word-web')
  );
}

function isManualLookupEmptyMessage(value: unknown): value is ManualLookupEmptyMessage {
  const typed = value as ManualLookupEmptyMessage;

  return (
    Boolean(typed) &&
    typed.type === 'MANUAL_LOOKUP_EMPTY' &&
    (typed.site === 'google-docs' || typed.site === 'word-web')
  );
}

function isTriggerManualLookupMessage(value: unknown): value is TriggerManualLookupMessage {
  const typed = value as TriggerManualLookupMessage;
  return Boolean(typed) && typed.type === 'TRIGGER_MANUAL_LOOKUP';
}

function createInitialState(tabId: number): SuggestionState {
  return {
    tabId,
    status: 'idle',
    claim: '',
    site: null,
    suggestions: [],
    error: null,
    requestId: 0,
    updatedAt: Date.now(),
  };
}

function getState(tabId: number): SuggestionState {
  const existing = tabStateMap.get(tabId);
  if (existing) {
    return existing;
  }

  const initial = createInitialState(tabId);
  tabStateMap.set(tabId, initial);
  return initial;
}

function setState(tabId: number, updates: Partial<SuggestionState>): SuggestionState {
  const merged: SuggestionState = {
    ...getState(tabId),
    ...updates,
    tabId,
    updatedAt: Date.now(),
  };

  tabStateMap.set(tabId, merged);
  notifySubscribers(tabId, merged);
  return merged;
}

function notifySubscribers(tabId: number, payload: SuggestionState): void {
  const ports = subscriberPorts.get(tabId);
  if (!ports || ports.size === 0) {
    return;
  }

  for (const port of ports) {
    try {
      port.postMessage({
        type: 'SUGGESTIONS_UPDATED',
        payload,
      });
    } catch {
      // Ignore closed port failures.
    }
  }
}

function cleanupTimer(tabId: number): void {
  const timer = debounceTimers.get(tabId);
  if (timer) {
    clearTimeout(timer);
    debounceTimers.delete(tabId);
  }
}

async function sendManualLookupMessage(tabId: number): Promise<void> {
  await chrome.tabs.sendMessage(tabId, {
    type: 'MANUAL_LOOKUP_REQUEST',
  });
}

async function hasContentScriptReceiver(tabId: number): Promise<boolean> {
  try {
    const response = (await chrome.tabs.sendMessage(tabId, {
      type: 'PING_CONTENT_SCRIPT',
    })) as { ok?: boolean } | undefined;

    return Boolean(response?.ok);
  } catch (error) {
    if (isMissingReceiverError(error)) {
      return false;
    }

    throw error;
  }
}

async function ensureContentScriptInjected(tabId: number): Promise<void> {
  if (await hasContentScriptReceiver(tabId)) {
    return;
  }

  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: [CONTENT_SCRIPT_FILE],
  });
}

async function ensureSupportedTabContentScript(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  if (!isSupportedEditorUrl(tab.url)) {
    return;
  }

  await ensureContentScriptInjected(tabId);
}

async function requestManualLookup(tabId: number): Promise<void> {
  try {
    await sendManualLookupMessage(tabId);
    return;
  } catch (error) {
    if (!isMissingReceiverError(error)) {
      throw error;
    }
  }

  await ensureSupportedTabContentScript(tabId);
  await sendManualLookupMessage(tabId);
}

async function executeLookup(tabId: number, pending: PendingLookup): Promise<void> {
  const settings = await getSettings();
  const claim = normalizeClaim(pending.claim);
  const previousState = getState(tabId);

  if (!claimLengthAllowed(claim, pending.mode)) {
    const minLength = minimumClaimLength(pending.mode);
    const label = pending.mode === 'manual' ? 'Selected text' : 'Claim';
    setState(tabId, {
      status: 'idle',
      site: pending.site,
      claim,
      suggestions: [],
      error: `${label} is too short. Use at least ${minLength} characters.`,
    });
    return;
  }

  if (pending.mode === 'auto' && claim === previousState.claim) {
    return;
  }

  const cacheKey = createCacheKey(claim, settings.style, settings.maxResults);
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    setState(tabId, {
      status: 'ready',
      site: pending.site,
      claim,
      error: null,
      suggestions: cached.suggestions,
    });
    return;
  }

  const currentRequestId = previousState.requestId + 1;
  setState(tabId, {
    status: 'loading',
    site: pending.site,
    claim,
    error: null,
    requestId: currentRequestId,
  });

  const previousController = inFlightControllers.get(tabId);
  if (previousController) {
    previousController.abort();
  }

  const controller = new AbortController();
  inFlightControllers.set(tabId, controller);

  const endpoint = new URL('/api/sources/suggest', settings.apiBaseUrl).toString();
  const requestBody = {
    claim,
    style: settings.style,
    maxResults: settings.maxResults,
  };

  if (settings.debugMode) {
    console.info('[sourcefinder] REQUEST_SUGGESTIONS', {
      tabId,
      endpoint,
      requestBody,
    });
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const payload = (await response.json()) as {
      suggestions?: SourceSuggestion[];
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error || `Lookup failed (HTTP ${response.status})`);
    }

    const latestState = getState(tabId);
    if (latestState.requestId !== currentRequestId) {
      return;
    }

    const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
    cache.set(cacheKey, {
      suggestions,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    setState(tabId, {
      status: 'ready',
      claim,
      site: pending.site,
      suggestions,
      error: null,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      return;
    }

    const latestState = getState(tabId);
    if (latestState.requestId !== currentRequestId) {
      return;
    }

    setState(tabId, {
      status: 'error',
      claim,
      site: pending.site,
      suggestions: [],
      error: error instanceof Error ? error.message : 'Lookup failed.',
    });
  } finally {
    if (inFlightControllers.get(tabId) === controller) {
      inFlightControllers.delete(tabId);
    }
  }
}

async function scheduleLookup(tabId: number, candidate: PendingLookup): Promise<void> {
  const settings = await getSettings();

  pendingLookups.set(tabId, candidate);
  cleanupTimer(tabId);

  if (candidate.mode === 'manual') {
    void executeLookup(tabId, candidate);
    return;
  }

  const delay = Number.isFinite(settings.debounceMs)
    ? Math.max(300, settings.debounceMs)
    : DEFAULT_SETTINGS.debounceMs;

  const timer = setTimeout(() => {
    const pending = pendingLookups.get(tabId);
    if (!pending) {
      return;
    }

    void executeLookup(tabId, pending);
  }, delay);

  debounceTimers.set(tabId, timer as unknown as number);
}

async function getActiveTabId(): Promise<number | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;

  return Number.isInteger(tabId) ? (tabId as number) : null;
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'SIDEPANEL') {
    return;
  }

  let subscribedTabId: number | null = null;

  port.onMessage.addListener((message: SubscribeTabMessage) => {
    if (!message || message.type !== 'SUBSCRIBE_TAB' || !Number.isInteger(message.tabId)) {
      return;
    }

    if (subscribedTabId !== null) {
      const previousPorts = subscriberPorts.get(subscribedTabId);
      previousPorts?.delete(port);
    }

    subscribedTabId = message.tabId;

    const ports = subscriberPorts.get(message.tabId) || new Set();
    ports.add(port);
    subscriberPorts.set(message.tabId, ports);

    void ensureSupportedTabContentScript(message.tabId).catch(() => {
      // Ignore injection failures here. A clearer message is shown on manual trigger.
    });

    port.postMessage({
      type: 'SUGGESTIONS_UPDATED',
      payload: getState(message.tabId),
    });
  });

  port.onDisconnect.addListener(() => {
    if (subscribedTabId === null) {
      return;
    }

    const ports = subscriberPorts.get(subscribedTabId);
    ports?.delete(port);

    if (!ports || ports.size === 0) {
      subscriberPorts.delete(subscribedTabId);
    }
  });
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const typedMessage = message as { type?: string; tabId?: number };

  if (isClaimCandidateMessage(message)) {
    const tabId = sender.tab?.id;
    if (!Number.isInteger(tabId)) {
      return;
    }

    const claim = normalizeClaim(message.claim);
    if (!claim) {
      return;
    }

    void scheduleLookup(tabId as number, {
      claim,
      mode: message.mode,
      site: message.site,
    });

    return;
  }

  if (isManualLookupEmptyMessage(message)) {
    const tabId = sender.tab?.id;
    if (!Number.isInteger(tabId)) {
      return;
    }

    setState(tabId as number, {
      status: 'idle',
      site: message.site,
      suggestions: [],
      error: 'No selected sentence found. Highlight a sentence, then run manual lookup.',
    });

    return;
  }

  if (isTriggerManualLookupMessage(message)) {
    void (async () => {
      const tabId = Number.isInteger(message.tabId)
        ? (message.tabId as number)
        : await getActiveTabId();

      if (tabId === null) {
        sendResponse({ ok: false, error: 'No active tab was found.' });
        return;
      }

      try {
        await requestManualLookup(tabId);
        sendResponse({ ok: true });
      } catch (error) {
        const message = toLookupErrorMessage(error);
        setState(tabId, {
          status: 'idle',
          site: getState(tabId).site,
          suggestions: [],
          error: message,
        });
        sendResponse({ ok: false, error: message });
      }
    })();

    return true;
  }

  if (typedMessage?.type === 'GET_TAB_STATE' && Number.isInteger(typedMessage.tabId)) {
    sendResponse(getState(typedMessage.tabId as number));
    return;
  }

  if (typedMessage?.type === 'GET_ACTIVE_TAB_STATE') {
    void (async () => {
      try {
        const tabId = await getActiveTabId();
        if (tabId === null) {
          sendResponse(null);
          return;
        }

        sendResponse(getState(tabId));
      } catch {
        sendResponse(null);
      }
    })();

    return true;
  }

  return;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'manual-lookup') {
    return;
  }

  const tabId = await getActiveTabId();
  if (tabId === null) {
    return;
  }

  try {
    await requestManualLookup(tabId);
  } catch (error) {
    const message = toLookupErrorMessage(error);
    setState(tabId, {
      status: 'idle',
      site: getState(tabId).site,
      suggestions: [],
      error: message,
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  cleanupTimer(tabId);
  pendingLookups.delete(tabId);
  inFlightControllers.get(tabId)?.abort();
  inFlightControllers.delete(tabId);
  tabStateMap.delete(tabId);
  subscriberPorts.delete(tabId);
});
