# CLI Proxy API Management Center

A single-file Web UI (React + TypeScript) for operating and troubleshooting the **CLI Proxy API** via its **Management API** (config, credentials, and logs).

[中文文档](README_CN.md)

## Project Positioning

- This repository is the Web management UI only.
- It reads/writes server-side management resources via `/v0/management`.
- It is not a request proxy and does not forward user traffic.

## Version & Access

- Main project: https://github.com/router-for-me/CLIProxyAPI
- UI fork (this repo): https://github.com/Gnonymous/API-Management-Center
- Example URL: https://remote.router-for.me/
- Minimum backend version: `>= 7.1.0` (recommended latest)
- Since CLIProxyAPI `6.0.19`, bundled UI is available at:
  - `http://<host>:<api_port>/management.html`

## Quick Start

### A. Use bundled UI (recommended)

1. Start CLIProxyAPI.
2. Open `http://<host>:<api_port>/management.html`.
3. Enter your Management Key and connect.

### B. Run local dev UI

```bash
npm ci
npm run dev
```

Open `http://localhost:5173` and connect to your running backend.

### C. Build single-file artifact

```bash
npm ci
npm run build
```

- Output: `dist/index.html` (fully inlined).
- Release flow can rename it to `management.html`.
- Preview: `npm run preview`.

## Connecting to the server

If you connect from a non-localhost browser, the server must allow remote management (e.g. `allow-remote-management: true`). Check the CLI Proxy API server documentation/config comments for the full authentication rules, server-side limits, and edge cases.

## Major Features

### Core management pages

- Dashboard
- Config Panel
- AI Providers (Gemini / Codex / Claude / Vertex / OpenAI-compatible / Ampcode)
- Auth Files
- OAuth
- Quota
- Usage
- Logs
- System
- API Endpoints
- Agent Settings

### What you can manage

- **Dashboard**: connection status, server version/build date, quick counts, model availability snapshot.
- **Config Panel**: visual editor for common `config.yaml` fields, basic settings, proxy `api-keys`, and source editing with YAML highlighting/search plus a save diff preview.
- **AI Providers**:
  - Gemini/Codex/Claude/Vertex key entries (base URL, headers, proxy, model aliases, excluded models, prefix).
  - OpenAI-compatible providers (multiple API keys, custom headers, model alias import via `/v1/models`, optional browser-side `chat/completions` test).
  - Ampcode integration (upstream URL/key, force mappings, model mapping table).
- **Auth Files**: upload/download/delete JSON credentials, filter/search/pagination, runtime-only indicators, view supported models per credential (when the server supports it), manage OAuth excluded models (supports `*` wildcards), configure OAuth model alias mappings.
- **OAuth**: start OAuth/device flows for Codex, Anthropic/Claude, Antigravity, Gemini CLI, Kimi, and xAI/Grok; poll status; submit callback URLs or xAI/Grok displayed codes; import Vertex JSON credentials and iFlow cookies.
- **Quota Management**: manage quota limits and usage for Claude, Antigravity, Codex, Gemini CLI, and other providers.
- **Logs**: tail logs with incremental polling, auto-refresh, search, hide management traffic, clear logs; download request error log files.
- **System**: quick links, update check, request logging toggle, local login data cleanup, and fetch `/v1/models` (grouped view). Requires at least one proxy API key to query models.

### API Endpoints page

The API Endpoints page is designed for endpoint-level diagnosis and model verification:

- Unified provider list from two sources:
  - Auth-file proxy providers
  - Configured API providers
- Model loading with alias and excluded-model filtering.
- Per-provider endpoint details:
  - Base URL
  - selected API key
  - model list
- One-click code snippets for `curl`, Python, and Node (OpenAI SDK style).
- Browser-side `chat/completions` connectivity test.

### Local Agent Settings page

The Agent Settings page targets local Claude Code model switching via local `settings.json`:

- Read/write local `~/.claude/settings.json` using File System Access API or backend-assisted file access.
- Persist selected file handle and restore after refresh (with permission checks).
- Edit 4 model-related env slots:
  - `ANTHROPIC_MODEL`
  - `ANTHROPIC_DEFAULT_OPUS_MODEL`
  - `ANTHROPIC_DEFAULT_SONNET_MODEL`
  - `ANTHROPIC_DEFAULT_HAIKU_MODEL`
- Provider-first workflow:
  - pick provider first
  - then pick model from that provider
- Per-slot model connectivity test.
- JSON preview before save.
- Codex-only thinking level support:
  - `low`, `medium`, `high`, `xhigh`
  - thinking options are only available when model/provider is confirmed as Codex.

## Related Projects & References

- CLIProxyAPI (upstream): https://github.com/router-for-me/CLIProxyAPI
- This Web UI fork: https://github.com/Gnonymous/API-Management-Center
- Claude Code settings reference (`~/.claude/settings.json` behavior): https://docs.anthropic.com/en/docs/claude-code
- Router-for-me thinking-level reference: https://help.router-for.me/cn/configuration/thinking.html
- OpenAI Chat Completions reference: https://platform.openai.com/docs/api-reference/chat
- OpenAI SDK (Python): https://github.com/openai/openai-python
- OpenAI SDK (Node.js): https://github.com/openai/openai-node

## Tech Stack

- React 19 + TypeScript 6.0
- Vite 8 (single-file build)
- Zustand
- Axios
- react-router-dom v7
- Motion
- CodeMirror 6
- SCSS Modules
- i18next

## Internationalization

Currently supports four languages:

- English (en)
- Simplified Chinese (zh-CN)
- Traditional Chinese (zh-TW)
- Russian (ru)

The UI language is automatically detected from browser settings and can be manually switched from the login page or header language menu.

## Browser Compatibility

- Build target: `ES2020`
- Supports modern browsers (Chrome, Firefox, Safari, Edge)
- Responsive layout for mobile and tablet access

## Build & release notes

- Vite produces a **single HTML** output (`dist/index.html`) with all assets inlined (via `vite-plugin-singlefile`).
- Tagging `vX.Y.Z` triggers `.github/workflows/release.yml` to publish `dist/management.html`.
- The UI version shown on the System page is injected at build time (env `VERSION`, git tag, or `package.json` fallback).

## Development Commands

```bash
npm run dev        # Vite dev server
npm run build      # tsc + Vite build
npm run preview    # serve dist locally
npm run lint       # ESLint
npm run format     # Prettier
npm run type-check # tsc --noEmit
```

## Security Notes

- The management key is stored in browser `localStorage` using a lightweight obfuscation format (`enc::v1::...`) to avoid plaintext storage; treat it as sensitive.
- For remote management, use strict network controls and least-exposure deployment.
- Treat local Agent settings files as sensitive configuration.

## Troubleshooting

- **Can’t connect / 401/403**: confirm the API address and management key; remote access may require enabling remote management in the server config.
- **Repeated auth failures**: the server may temporarily block remote IPs.
- **Logs page missing**: enable “Logging to file” in Config Panel; the navigation item is shown only when file logging is enabled.
- **Some features show “unsupported”**: the backend may be too old or the endpoint is disabled/absent.
- **Endpoint test fails in browser**: may be caused by browser network/CORS context and does not always mean the server cannot reach the provider.
- **Local Agent file not restored after refresh**: browser permission may need to be re-granted.

## Contributing

Issues and PRs are welcome. Please include:

- Reproduction steps (server version + UI version)
- Screenshots for UI changes
- Verification notes (`npm run lint`, `npm run type-check`, `npm run build`)

## License

MIT
