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
  const [statusTone, setStatusTone] = useState<'success' | 'error'>('success');
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
        <section className="options-panel loading-state">
          <p className="eyebrow">Source Finder</p>
          <h1>Control Room Settings</h1>
          <p>Loading settings...</p>
        </section>
      </main>
    );
  }

  const onSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedApiBase = settings.apiBaseUrl.trim();
    if (!isValidApiBaseUrl(normalizedApiBase)) {
      setStatusTone('error');
      setStatus('Enter a valid API base URL, such as http://localhost:3000');
      return;
    }

    const nextSettings: ExtensionSettings = {
      ...settings,
      apiBaseUrl: normalizedApiBase,
      debounceMs: Math.max(300, Math.min(5000, Number(settings.debounceMs) || 1500)),
      maxResults: Math.max(1, Math.min(10, Number(settings.maxResults) || 5)),
    };

    try {
      await setSettings(nextSettings);
      setLocalSettings(nextSettings);
      setStatusTone('success');
      setStatus('Saved. New lookups will use these settings.');
    } catch (error) {
      setStatusTone('error');
      setStatus(error instanceof Error ? error.message : 'Could not save settings.');
    }
  };

  return (
    <main className="options-root">
      <section className="options-panel">
        <header className="options-header">
          <p className="eyebrow">Source Finder</p>
          <h1>Control Room Settings</h1>
          <p className="lead">
            Tune backend access, citation formatting, and lookup cadence.
          </p>
        </header>

        <form onSubmit={onSave} className="options-form">
          <section className="form-block">
            <h2>Connection</h2>
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
          </section>

          <section className="form-block">
            <h2>Citation Output</h2>
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
          </section>

          <section className="form-block">
            <h2>Lookup Behavior</h2>
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
          </section>

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
            <span>Enable debug logs in the background worker console.</span>
          </label>

          <div className="form-footer">
            <p className="helper-text">Changes apply to new lookups immediately.</p>
            <button type="submit">Save Settings</button>
          </div>
        </form>

        {status ? <p className={`status ${statusTone}`}>{status}</p> : null}
      </section>
    </main>
  );
}
