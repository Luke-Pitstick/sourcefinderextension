const path = require('node:path');

const express = require('express');

const { generateCitationFromUrl } = require('./citationService');
const {
  DEFAULT_CONFIDENCE_THRESHOLD,
  createSourceSearchService,
} = require('./sourceSearchService');
const { STYLE_OPTIONS } = require('./styles');

const app = express();
const port = Number.parseInt(process.env.PORT || '3000', 10);
const sourceSearchService = createSourceSearchService();

const corsAllowList = String(process.env.SOURCEFINDER_CORS_ORIGINS || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

function isOriginAllowed(origin) {
  if (!origin) {
    return true;
  }

  if (corsAllowList.length === 0) {
    return true;
  }

  return corsAllowList.some((allowed) => {
    if (allowed === '*') {
      return true;
    }

    if (allowed === 'chrome-extension://*') {
      return origin.startsWith('chrome-extension://');
    }

    if (allowed.endsWith('*')) {
      return origin.startsWith(allowed.slice(0, -1));
    }

    return origin === allowed;
  });
}

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  const origin = req.get('origin');
  const allowed = isOriginAllowed(origin);

  if (origin && allowed) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'Origin');
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type');
  }

  if (req.method === 'OPTIONS') {
    return allowed ? res.sendStatus(204) : res.sendStatus(403);
  }

  if (!allowed) {
    return res.status(403).json({ error: 'Origin is not allowed.' });
  }

  return next();
});

app.get('/', (_req, res) => {
  res.json({
    name: 'sourcefinder-backend',
    status: 'ok',
    endpoints: ['/health', '/api/styles', '/api/cite', '/api/sources/suggest'],
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/styles', (_req, res) => {
  res.json({
    styles: STYLE_OPTIONS.map((style) => ({
      id: style.id,
      label: style.label,
    })),
  });
});

app.post('/api/cite', async (req, res) => {
  const url = typeof req.body?.url === 'string' ? req.body.url : '';
  const style = typeof req.body?.style === 'string' ? req.body.style : 'apa';

  if (!url) {
    return res.status(400).json({ error: 'A URL is required.' });
  }

  try {
    const result = await generateCitationFromUrl(url, style);

    return res.json(result);
  } catch (error) {
    const message = error?.message || 'Unable to generate citation.';
    const status =
      message.startsWith('Invalid URL') ||
      message.startsWith('Unsupported style') ||
      message.includes('does not look like an HTML')
        ? 400
        : 500;

    return res.status(status).json({ error: message });
  }
});

app.post('/api/sources/suggest', async (req, res) => {
  const claim = typeof req.body?.claim === 'string' ? req.body.claim : '';
  const style = typeof req.body?.style === 'string' ? req.body.style : 'apa';
  const context = typeof req.body?.context === 'string' ? req.body.context : '';
  const maxResults = Number.isInteger(req.body?.maxResults)
    ? req.body.maxResults
    : Number.parseInt(req.body?.maxResults || '5', 10);

  if (!claim.trim()) {
    return res.status(400).json({ error: 'A claim is required.' });
  }

  try {
    const result = await sourceSearchService.suggestSources({
      claim,
      style,
      context,
      maxResults,
      threshold: DEFAULT_CONFIDENCE_THRESHOLD,
    });

    process.stdout.write(
      `${JSON.stringify({
        event: 'sources_suggest',
        claimLength: result.claim.length,
        suggestionCount: result.suggestions.length,
        diagnostics: result.diagnostics,
      })}\n`,
    );

    return res.json({
      claim: result.claim,
      style: result.style,
      suggestions: result.suggestions,
    });
  } catch (error) {
    const message = error?.message || 'Unable to suggest sources.';
    const status =
      message.startsWith('A claim is required') ||
      message.startsWith('Unsupported style') ||
      message.startsWith('Claim length must')
        ? 400
        : 500;

    return res.status(status).json({ error: message });
  }
});

app.listen(port, () => {
  process.stdout.write(`Citation web app: http://localhost:${port}\n`);
});
