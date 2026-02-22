# Repository Guidelines

## Project Structure & Module Organization

This is a Vite + React + TypeScript single-page app. Core code lives in `src/`:

- `src/pages/`: route-level pages (for example `AiProvidersPage.tsx`, `UsagePage.tsx`).
- `src/components/`: reusable UI and domain components (`common/`, `layout/`, `providers/`, `usage/`, etc.).
- `src/services/`: API and storage integration (`api/`, `storage/`).
- `src/stores/`: Zustand stores (`useAuthStore.ts`, `useConfigStore.ts`, ...).
- `src/hooks/`, `src/utils/`, `src/types/`, `src/i18n/`, `src/styles/`: shared logic, typings, localization, and styling.
  Build/config files are in the repo root (`vite.config.ts`, `tsconfig*.json`, `eslint.config.js`).

## Build, Test, and Development Commands

Use npm scripts from the project root:

```bash
npm run dev        # start Vite dev server
npm run build      # type-check via tsc, then production build
npm run preview    # preview built output
npm run lint       # run ESLint for .ts/.tsx
npm run format     # format src/**/*.{ts,tsx,css,scss}
npm run type-check # strict TypeScript check (no emit)
```

## Coding Style & Naming Conventions

- TypeScript is strict; keep code type-safe and avoid `any` unless unavoidable.
- Formatting is enforced by Prettier: 2 spaces, single quotes, semicolons, max line length 100.
- Follow existing naming patterns:
  - React components/pages: PascalCase (`AuthFilesPage.tsx`).
  - Hooks: `useXxx` (`useMediaQuery.ts`).
  - Stores: `useXxxStore` (`useThemeStore.ts`).
  - Utility modules: concise lowercase names (`format.ts`, `clipboard.ts`).

## Testing Guidelines

There is currently no dedicated unit test runner configured. Quality gates are:

- `npm run lint`
- `npm run type-check`

For new tests, colocate as `*.test.ts`/`*.test.tsx` near the feature and keep them deterministic.

## Commit & Pull Request Guidelines

Recent history follows Conventional Commit style, usually with scope:

- `feat(usage): ...`
- `fix(auth-files): ...`
- `refactor(api): ...`
- `chore(build): ...`

For PRs, include:

- clear reproduction/validation steps (server version + UI version),
- screenshots for UI changes,
- verification notes showing `npm run lint` and `npm run type-check` passed.

## Security & Configuration Tips

Do not commit secrets, tokens, or private endpoint credentials. Keep environment-specific settings out of source files and document any new configuration keys in `README.md`.

## Fork & Upstream Sync Workflow

This project is a fork. Remote configuration:

```
origin   → https://github.com/Gnonymous/API-Management-Center.git  (your fork)
upstream → https://github.com/router-for-me/Cli-Proxy-API-Management-Center.git  (original)
```

### Sync upstream updates to your fork

```bash
git fetch upstream
git rebase upstream/main        # rebase keeps linear history and minimizes conflicts
git push origin main --force-with-lease
```

### Push your own changes

```bash
git add <changed files>
git commit -m "feat(scope): description"
git push origin main
```

### Conflict minimization principles

- New pages go under `src/pages/` as **new files** — zero conflict risk.
- Route additions: append one line to `mainRoutes` array in `MainRoutes.tsx`.
- Nav additions: append one entry to `navItems` array in `MainLayout.tsx`.
- Icon additions: append export to `src/components/ui/icons.tsx`.
- i18n additions: append new keys/sections to the **end** of each locale JSON file.
- Never modify shared business logic files unless fixing a bug.

### Local development

```bash
pnpm install      # install dependencies (pnpm stores packages globally, saves disk)
pnpm run dev      # start Vite dev server at http://localhost:5173
pnpm run type-check   # TypeScript check without build
pnpm run lint         # ESLint check
```

Connect the UI to a running CLIProxyAPI instance via the login screen (API Base URL + Management Key).

### Cleanup

```bash
rm -rf node_modules   # remove after done; reinstall anytime with pnpm install
pnpm store prune      # clean up unused global pnpm cache
```
