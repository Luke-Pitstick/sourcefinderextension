import { useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  getSettings,
  isValidApiBaseUrl,
  setSettings,
} from '../shared/storage';
import type { CitationStyle, ExtensionSettings } from '../types';

const STYLE_CHOICES: Array<{ id: CitationStyle; label: string }> = [
  { id: 'apa', label: 'APA (7th Edition)' },
  { id: 'mla', label: 'MLA (9th Edition)' },
  { id: 'chicago', label: 'Chicago (Author-Date)' },
  { id: 'ieee', label: 'IEEE' },
  { id: 'harvard', label: 'Harvard' },
  { id: 'vancouver', label: 'Vancouver' },
];

export function Options(): JSX.Element {
  const [settings, setLocalSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getSettings().then((saved) => {
      setLocalSettings(saved);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <main className="options-root">
        <p>Loading settings...</p>
      </main>
    );
  }

  const onSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedApiBase = settings.apiBaseUrl.trim();
    if (!isValidApiBaseUrl(normalizedApiBase)) {
      setStatus('Enter a valid API base URL, such as http://localhost:3000');
      return;
    }

    const nextSettings: ExtensionSettings = {
      ...settings,
      apiBaseUrl: normalizedApiBase,
      debounceMs: Math.max(300, Math.min(5000, Number(settings.debounceMs) || 1500)),
      maxResults: Math.max(1, Math.min(10, Number(settings.maxResults) || 5)),
    };

    await setSettings(nextSettings);
    setLocalSettings(nextSettings);
    setStatus('Saved. New lookups will use these settings.');
  };

  return (
    <main className="options-root">
      <section className="options-panel">
        <p className="eyebrow">Source Finder</p>
        <h1>Extension Settings</h1>
        <p className="lead">
          Configure your local backend, citation style, and lookup behavior.
        </p>

        <form onSubmit={onSave} className="options-form">
          <label>
            Backend API Base URL
            <input
              type="url"
              value={settings.apiBaseUrl}
              onChange={(event) => {
                setLocalSettings((previous) => ({
                  ...previous,
                  apiBaseUrl: event.target.value,
                }));
              }}
              placeholder="http://localhost:3000"
              required
            />
          </label>

          <label>
            Citation Style
            <select
              value={settings.style}
              onChange={(event) => {
                setLocalSettings((previous) => ({
                  ...previous,
                  style: event.target.value as CitationStyle,
                }));
              }}
            >
              {STYLE_CHOICES.map((style) => (
                <option key={style.id} value={style.id}>
                  {style.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Auto Lookup Debounce (ms)
            <input
              type="number"
              min={300}
              max={5000}
              step={100}
              value={settings.debounceMs}
              onChange={(event) => {
                setLocalSettings((previous) => ({
                  ...previous,
                  debounceMs: Number(event.target.value),
                }));
              }}
            />
          </label>

          <label>
            Max Results
            <input
              type="number"
              min={1}
              max={10}
              step={1}
              value={settings.maxResults}
              onChange={(event) => {
                setLocalSettings((previous) => ({
                  ...previous,
                  maxResults: Number(event.target.value),
                }));
              }}
            />
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={settings.debugMode}
              onChange={(event) => {
                setLocalSettings((previous) => ({
                  ...previous,
                  debugMode: event.target.checked,
                }));
              }}
            />
            Enable debug logs in the background worker console.
          </label>

          <button type="submit">Save Settings</button>
        </form>

        {status ? <p className="status">{status}</p> : null}
      </section>
    </main>
  );
}
