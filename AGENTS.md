# AGENTS.md

## Cursor Cloud specific instructions

This repo is **Unicorn 2.0** ("Unicorn - Compliance Management System"), a single-page
Vite + React + TypeScript frontend (shadcn/ui + Tailwind). See `README.md` and
`CONTRIBUTING.md` for architecture, RBAC, and code conventions.

### Services / architecture

- There is **one service**: the Vite frontend. There is **no local backend or database
  to run**. The app talks to a **remote hosted Supabase** project whose public
  credentials are already committed in `.env` (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`). No local Supabase/Docker is needed for normal
  frontend development.
- `supabase/functions/**` are Deno edge functions deployed to that hosted Supabase; they
  are not run locally as part of the dev loop.

### Package manager (non-obvious)

- The repo contains **both** `bun.lock` and `package-lock.json`, but **bun is not
  installed** on this VM. Use **npm** (Node 22 is installed; Vite 8 requires Node 20+).
- `npm install` emits an `ERESOLVE` peer-dependency warning for `lovable-tagger` vs
  `vite@8` — this is expected and harmless; install still succeeds.

### Commands

- Dev server: `npm run dev` — serves on **http://localhost:8080** (host `::`, port set in
  `vite.config.ts`).
- Build: `npm run build` (production; also inlines critical CSS + writes `version.json`).
  `npm run build:dev` for a development-mode build.
- Lint: `npm run lint`. NOTE: the codebase currently reports **many thousands of
  pre-existing eslint errors** (including in `supabase/functions/**`); a non-zero exit is
  the current baseline, not an environment problem.
- Tests: there is **no `test` script in `package.json`** despite `CONTRIBUTING.md`
  referencing `npm run test`. Run the vitest suite directly with **`npx vitest run`**
  (watch mode: `npx vitest`). A handful of tests fail on a clean checkout (e.g. a
  `supabase.auth.getUser is not a function` mock gap and an RBAC public-route
  expectation) — these are pre-existing, not environment issues.

### Auth / testing gotcha

- The landing route `/` is the **Login** page. All app routes beyond it are behind
  `ProtectedRoute` and require a real Supabase session. Auth methods: email+password,
  magic link (`signInWithOtp`), and Microsoft 365 (Azure OAuth) — all against the
  **production** hosted Supabase. There are **no seeded/test credentials** in this
  environment, so reaching the authenticated dashboards requires valid production
  credentials supplied out of band. The password-reset and magic-link flows do reach the
  live backend and can be used to smoke-test connectivity without logging in.
