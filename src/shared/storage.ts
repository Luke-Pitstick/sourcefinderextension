import type { ExtensionSettings } from '../types';

const STORAGE_KEY = 'sourceFinderSettings';

export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiBaseUrl: 'http://localhost:3000',
  style: 'apa',
  debounceMs: 1500,
  maxResults: 5,
  debugMode: false,
};

export async function getSettings(): Promise<ExtensionSettings> {
  const data = await chrome.storage.sync.get(STORAGE_KEY);
  const value = data[STORAGE_KEY] as Partial<ExtensionSettings> | undefined;

  if (!value) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    ...DEFAULT_SETTINGS,
    ...value,
  };
}

export async function setSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.sync.set({
    [STORAGE_KEY]: settings,
  });
}

export function isValidApiBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
