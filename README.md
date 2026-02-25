# CLI Proxy API Management Center

A single-file React + TypeScript Web UI for operating **CLIProxyAPI** through its Management API.

[中文文档](README_CN.md)

## Project Positioning

- This repository is the Web management UI only.
- It reads/writes server-side management resources via `/v0/management`.
- It is not a request proxy and does not forward user traffic.

## Version & Access

- Main project: https://github.com/router-for-me/CLIProxyAPI
- UI fork (this repo): https://github.com/Gnonymous/API-Management-Center
- Minimum backend version: `>= 6.8.0` (recommended `>= 6.8.15`)
- Since CLIProxyAPI `6.0.19`, bundled UI is available at:
  - `http://<host>:<api_port>/management.html`

## Quick Start

### A. Use bundled UI (recommended)

1. Start CLIProxyAPI.
2. Open `http://<host>:<api_port>/management.html`.
3. Enter your Management Key and connect.

### B. Run local dev UI

```bash
npm install
npm run dev
```

Open `http://localhost:5173` and connect to your running backend.

### C. Build single-file artifact

```bash
npm run build
```

- Output: `dist/index.html` (fully inlined).
- Release flow can rename it to `management.html`.
- Preview: `npm run preview`.

## Major Features

### Core management pages

- Dashboard
- Basic Settings
- API Keys
- AI Providers (Gemini / Codex / Claude / Vertex / OpenAI-compatible / Ampcode)
- Auth Files
- OAuth
- Quota
- Usage
- Config editor (`/config.yaml`)
- Logs
- System

### New: API Endpoints page

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

### New: Local Agent Settings page

The Agent Settings page targets local Claude Code model switching via local `settings.json`:

- Read/write local `~/.claude/settings.json` using File System Access API.
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

- React 19
- TypeScript 5.9
- Vite 7 + `vite-plugin-singlefile`
- Zustand
- Axios
- react-router-dom v7
- Chart.js
- CodeMirror 6
- SCSS Modules
- i18next

## Development Commands

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run format
npm run type-check
```

## Security Notes

- Management key is stored in browser local storage with lightweight obfuscation (`enc::v1::...`), not plaintext.
- For remote management, use strict network controls and least-exposure deployment.
- Treat local Agent settings files as sensitive configuration.

## Troubleshooting

- `401/403` on login: verify API base and Management Key.
- Features marked unsupported: backend endpoint may be missing or backend version too old.
- Endpoint test fails in browser: may be caused by network/CORS in browser context.
- Local Agent file not restored after refresh: browser permission may need to be re-granted.

## License

MIT
