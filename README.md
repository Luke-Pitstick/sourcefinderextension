# Source Finder Extension

Chrome MV3 extension for Google Docs and Word web that suggests supporting scholarly sources while you write.

## Development

```bash
npm install
npm run backend:install
npm run build
```

Load this repo's `dist` folder as an unpacked extension in `chrome://extensions`.

## Settings

Open extension options and configure:

- API base URL (default: `http://localhost:3000`)
- Citation style (APA/MLA/Chicago/IEEE/Harvard/Vancouver)
- Auto lookup debounce
- Max results
- Debug mode

## Backend

Run the backend from this project:

```bash
cd /path/to/sourcefinderextension
npm run backend:start
```

For strict CORS control, set:

```bash
export SOURCEFINDER_CORS_ORIGINS="chrome-extension://*,http://localhost:3000"
```

Optional provider contact info:

```bash
export SOURCEFINDER_CONTACT_EMAIL="you@example.com"
```

## Usage

- Open Google Docs (`docs.google.com`) or Word web (`word.office.com`) in Chrome.
- Start typing a full claim sentence and pause briefly.
- View suggestions in the side panel.
- Manual lookup hotkey: `Ctrl+Shift+F` (`Command+Shift+F` on macOS).
