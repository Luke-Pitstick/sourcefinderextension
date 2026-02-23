# Source Finder Backend

Local API used by the Source Finder Chrome extension.

## Run

```bash
npm install
npm start
```

Server runs at `http://localhost:3000` by default.

## API

- `POST /api/sources/suggest`
- `POST /api/cite`
- `GET /api/styles`

## Environment

- `PORT` default: `3000`
- `SOURCEFINDER_CORS_ORIGINS` comma-separated allowlist (supports `chrome-extension://*`)
- `SOURCEFINDER_CONTACT_EMAIL` optional provider contact email
- `SOURCEFINDER_USER_AGENT` optional custom user agent
