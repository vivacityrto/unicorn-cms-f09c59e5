# AGENTS.md

Cross-tool rulebook for this repo — read natively by Cursor and Codex, and
imported into `CLAUDE.md` for Claude Code (`@AGENTS.md`). This is the single
source of truth for anything more than one tool needs to know. Tool-specific
mechanics (e.g. Claude Code session-ritual detail) live in `CLAUDE.md` instead
of being duplicated here.

## What this repo is

**Unicorn 2.0** ("Unicorn — Compliance Management System"), a single-page Vite +
React + TypeScript frontend (shadcn/ui + Tailwind). See `README.md` and
`CONTRIBUTING.md` for architecture, RBAC, and code conventions.

As of 2026-08-06 this repo also holds the team's process knowledge base
(`docs/kb/`) and audit trail (`docs/audit-log/`), consolidated in from the
former `unicorn-kb` and `unicorn-audit` repos — see
[docs/kb/README.md](docs/kb/README.md) for why and what changed.

## Services / architecture

- There is **one service**: the Vite frontend. There is **no local backend or
  database to run**. The app talks to a **remote hosted Supabase** project
  whose public credentials are already committed in `.env`
  (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`). No local
  Supabase/Docker is needed for normal frontend development.
- `supabase/functions/**` are Deno edge functions deployed to that hosted
  Supabase; they are not run locally as part of the dev loop.

## Package manager (non-obvious)

- The repo contains **both** `bun.lock` and `package-lock.json`, but **bun is
  not installed** on most dev VMs. Use **npm** (Node 22 is installed; Vite 8
  requires Node 20+).
- `npm install` emits an `ERESOLVE` peer-dependency warning for
  `lovable-tagger` vs `vite@8` — this is expected and harmless; install still
  succeeds.

## Commands

- Dev server: `npm run dev` — serves on **http://localhost:8080** (host `::`,
  port set in `vite.config.ts`).
- Build: `npm run build` (production; also inlines critical CSS + writes
  `version.json`). `npm run build:dev` for a development-mode build.
- Lint: `npm run lint`. NOTE: the codebase currently reports **~4,100
  pre-existing eslint errors** (measured 2026-09-01; corrected from an
  earlier vaguer "many thousands" here — 97% of them are a single rule,
  `@typescript-eslint/no-explicit-any`, including in `supabase/functions/**`);
  a non-zero exit is the current baseline, not an environment problem.
  `eslint.config.js`'s top-level `ignores` now also excludes
  `.worktrees/**`/`worktrees/**`/`.claude/worktrees/**` — without it, ESLint
  was re-linting the full contents of any stray nested git worktree left
  inside the repo (see "Local dev server troubleshooting" below for the
  same class of problem hitting Vite's dep scanner).
- Lint ratchet (P0.4, `docs/kb/reference/codebase-optimization-plan-2026-08-28.md`):
  `npm run lint:ratchet` (`scripts/lint-ratchet.mjs`) is diff-scoped, not a
  full-repo check — for every `.ts`/`.tsx` file changed since
  `origin/main` (override the base with `LINT_RATCHET_BASE`), it compares
  that file's lint error count before vs. after. A file that already had
  errors and still has the *same* count after your change passes (fixing
  the ~4,100-error backlog isn't required to ship a PR); a file with *more*
  errors than before, or a brand-new file with any errors at all, fails the
  check. Runs in CI on every PR (`.github/workflows/lint-ratchet.yml`).
  Separately, `@typescript-eslint/no-unused-vars` (off repo-wide) is now
  `error` for `src/services/**` and `src/contexts/**` specifically — both
  tested at zero violations, the plan's requested "one bounded directory"
  proof that the rule doesn't regress before wider adoption is considered.
- Tests (P0.2, `docs/kb/reference/codebase-optimization-plan-2026-08-28.md`):
  canonical scripts now exist — `npm run test:frontend` (Vitest, `src/**`),
  `npm run test:edge` (Node's built-in `node:test` runner over
  `supabase/functions/**`), `npm run typecheck`, and `npm run test` (runs
  both suites, then prints the Edge test inventory below so a green run can
  never be read as "all Edge tests"). `CONTRIBUTING.md`'s `npm run test`
  reference is accurate again. As of P0.2 (2026-09-01), `npm run test:frontend`
  passes clean on a fresh checkout — 22 files / 282 tests / 15 skipped, 0
  failing — superseding an earlier note here about pre-existing mock-gap/RBAC
  failures; re-verify before trusting that figure if it's been a while.
  `npm run typecheck` is intentionally **not** chained into `npm run test`:
  it currently reports one pre-existing error (`ContactDirectory.tsx`
  TS2345, an object literal missing `csc_user_id`) that predates P0.2 and is
  out of scope for a tooling PR to fix — a follow-up, not something this
  change introduced. `npm run typecheck` **is not** `tsc -b --noEmit`: that
  composite/project-references invocation reliably crashes with
  `JavaScript heap out of memory` after ~6.5 minutes on this codebase's
  default V8 heap (~2 GB), regardless of system load. The script instead
  runs `tsconfig.app.json` and `tsconfig.node.json` as two separate
  `tsc -p <config> --noEmit` invocations with `--max-old-space-size=4096`,
  which peaks lower because each project's graph is freed before the next
  starts. It's still slow (several minutes for the app project alone) and
  its exact duration varies a lot with whatever else is resident on this
  machine (this dev box has only ~8 GB total RAM) — don't read a slow run as
  broken. A full performance diagnosis is out of scope here.
- `npm run seed:tsc-cache` (`scripts/seed-tsc-cache.mjs`, 2026-09-04) copies
  `node_modules/.cache/tsc/*.tsbuildinfo` from the main checkout or a
  sibling worktree into the current one — run it once right after
  `npm install` in a freshly created worktree, before the first
  `npm run typecheck`, so that first run isn't a guaranteed full cold
  compile. Safe by construction: `tsc --incremental` re-validates every
  file's content against the cache before trusting it, so a stale or even
  unrelated seed can only cost extra cache misses, never a wrong result.
  Skips itself (no-op) if the current worktree already has a cache, unless
  passed `--force`. Not yet a mandated step — see
  `docs/kb/reference/execution-efficiency-log.md`'s "TS cache seeding —
  baseline and milestones" for why (two trials so far disagree nearly 6x on
  the speedup, though both beat a cold run) and what needs to be true
  before it's promoted to standard practice.
- Vitest single-file/teardown speed (P0.3): the plan's evidence for this
  candidate ("single files can take 27-90s and report fork termination
  timeouts") does **not** currently reproduce. Verified 2026-09-01 on
  Vitest 4.1.10/Vite 8.1.0: 6 individual single-file runs (`useAuth`,
  `tenant/isolation`, `eos/meetings`, and all 3 `rbac/*` files) each
  completed in 3.5-9s wall time with a clean exit and no warning of any
  kind; the full 22-file/282-test suite completes in ~33s. Whatever caused
  the original observation isn't present in this environment/version
  combination right now — treat it as resolved unless it resurfaces, not as
  a standing problem to keep re-diagnosing. `npm run test:frontend:changed`
  (`vitest run --changed`, new) is the fast focused-test mode the plan asked
  for — runs only tests related to files changed since the last commit.
- Edge Function tests: `npm run test:edge` covers `.test.mjs` files plus
  Deno-free `.test.ts`/`.node-test.ts` files (mostly static source-pattern
  assertions against `index.ts`, since Deno isn't available locally). It does
  **not** cover files that reference the `Deno.test` global or a
  `deno.land`/`npm:` import specifier — those need the Deno CLI, which isn't
  installed in this environment (as of P0.2: 14 such files, all under
  `supabase/functions/_shared/ask-viv-*` and a handful of others — see
  `scripts/report-edge-test-inventory.mjs`). Run
  `node scripts/report-edge-test-inventory.mjs`
  (or just `npm run test`, which calls it automatically) to see the exact
  file-by-file split. These were excluded from the normal test command for
  long enough that some had gone stale — see the guardrail below.
- **Known gap, parked for later (found 2026-09-01, not yet actioned):**
  `src/test/tenant/isolation.test.tsx` has a genuinely good live-RLS suite
  (15 real tests — cross-tenant message/conversation access,
  same-tenant-different-conversation access, staff bypass, all against a
  real hosted-Supabase connection with seeded personas) guarding exactly
  the kind of cross-client message leak a change to `tenant_messages`/
  `conversation_participants` RLS could introduce. It requires
  `SUPABASE_SERVICE_ROLE_KEY` (non-`VITE_`-prefixed, read from
  `process.env`, never bundled — see the file's own header comment) and
  `describe.skipIf`s the whole block when that's unset. As of this date,
  that variable is **not set in local dev** and **not a secret in any
  `.github/workflows/*.yml`** — running `npx vitest run
  src/test/tenant/isolation.test.tsx` here reports "11 passed, 15
  skipped," and the 11 that pass are the unrelated legacy placeholder
  block (`expect(true).toBe(true)` stubs), not this suite. So the suite
  has never actually been proven to pass anywhere, CI included — it was
  verified this date by directly reading the live `pg_policies` and their
  `SECURITY DEFINER` helper functions (`is_conversation_participant_safe`,
  `has_tenant_access_safe`, etc.) via Supabase MCP instead, which confirmed
  correct scoping (message SELECT requires actual conversation-participant
  membership, not just a tenant match). Wiring `SUPABASE_SERVICE_ROLE_KEY`
  into CI so this suite actually runs is a separate, not-yet-scoped
  follow-up — deliberately not done as a side effect of this note.
- Architecture metrics (P0.5, `docs/kb/reference/codebase-optimization-plan-2026-08-28.md`):
  `npm run metrics` (`scripts/architecture-metrics.mjs`) reproduces the
  plan's section-3 baseline table from a script instead of an ad-hoc pass —
  file/line counts, files over 600/1000 lines, wrapper files, Supabase
  import/call counts by pages/components/hooks, Zod adoption, `unicorn_role`
  spread, and an `any`-keyword count (tracks closely with the real
  `@typescript-eslint/no-explicit-any` ESLint count — 4288 vs. 4023 measured
  the same day, not identical since this is a raw grep, not a parse). Runs
  in under a second; deliberately walks only `src/` and `supabase/functions/`
  by name (never the repo root), so a stray nested git worktree is never
  visited — no separate exclusion needed there, unlike `eslint.config.js`.
  `supabase/migrations/**` and `docs/audit-log/**` are out of scope
  entirely, not merely filtered. `--json` for machine-readable output,
  `--out <file>` to write instead of printing. Re-measured 2026-09-01
  against the plan's original 28 Aug baseline: most figures track closely
  (files-over-600/1000, wrapper count, frontend test count, Zod adoption all
  match exactly or near-exactly) but "direct Supabase calls" reads notably
  higher here (97/179/237 by pages/components/hooks vs. the plan's
  73/137/144) — different detection method (regex over `supabase\.(from|
  rpc|storage|functions)\(`, not whatever the original ad-hoc pass used),
  not a regression. Don't compare the two without accounting for that.
- Route manifest (P0.6, `docs/kb/reference/codebase-optimization-plan-2026-08-28.md`):
  `npm run routes` (`scripts/generate-route-manifest.mjs`) replaces the
  retired `scripts/generate-route-inventory.mjs`. The old one only read
  `src/App.tsx`, via an indentation-sensitive string search (it assumed the
  next `<Route>` started with exactly 12 spaces) capped at an 800-4000
  character window — silently wrong for anything shaped differently, and
  structurally incapable of seeing a route declared in any other file. The
  new one walks a real TypeScript/TSX AST (the `typescript` package, already
  a dependency) and scans every `.tsx` file under `src/` for `<Route>` JSX,
  so a route extracted into its own module later (P1.2) is picked up
  automatically — proven with a fixture: a route declared in a second file
  outside `App.tsx` was correctly extracted with full guard/lazy/import
  detail, then the fixture file was removed. No hardcoded guard-name
  whitelist either: any JSX wrapper with a nested element/self-closing child
  is treated as a guard layer regardless of name (works for `ProtectedRoute`
  today, and for whatever wraps routes after P1.4's metadata work).
  Per route it records: path, dynamic `:params`, rendered component, whether
  it's lazy-loaded + its import source, the full guard wrapper chain + exact
  props (`requireSuperAdmin`, `allowedRoles={CONST}`, `allowVivacityTeam`,
  etc.), `<Navigate>` redirect target + `replace`, and the declaring file.
  Verified against the old script: same 244 routes, same single duplicate
  (`/support-tickets`) — the only difference is the new one lists both
  `/support-tickets` registrations individually (with guard/component detail
  for each) rather than deduping to one row, which is more useful, not a
  regression. `--json`/`--out <file>` supported like the other new scripts.
  `npm run routes:check-drift` (`scripts/check-route-drift.mjs`) compares
  `route-inventory-by-role.md`'s claimed route count against the live one
  and already caught real drift: the doc claims 249 (`/academy/team` and
  four `/compliance-audits` routes were retired without the doc being
  regenerated), live is 244. **Deliberately not wired into CI as a blocking
  gate** — the doc is already known-stale, so a hard gate would just fail
  every unrelated PR until Phase 1 (KB truth restoration) reconciles the
  actual tables; that reconciliation is out of scope for a Phase 0 tooling
  change. Run it manually, or make it a CI gate once Phase 1 lands.

## Workflow efficiency checkpoints (standing practice, added 2026-09-04)

When starting a new phase of a multi-batch plan (e.g. a new sub-phase of
`docs/kb/reference/codebase-optimization-plan-2026-08-28.md`), or after
~5-10 batches of the same repetitive pattern within a phase, pause and
actively look for ways to cut *overhead* before continuing — never by
cutting a verification step. Every shipped change still gets the full
sequence: `lint:ratchet`, `typecheck`, `test:frontend`, `test:edge`, and a
live Playwright check. The things worth reviewing each time:

- **Worktree reuse.** A fresh `EnterWorktree` + `npm install` per tiny
  batch pays a full dependency install every time. When doing a run of
  several small, same-shaped fixes back to back, do them in one
  persistent worktree (rebase onto `origin/main` between merges) instead
  of a fresh worktree per PR.
- **Parallel verification.** `typecheck`, `test:frontend`, and `test:edge`
  are independent — run them concurrently (background one or two, block
  on all three) instead of one after another. Wall-clock cost becomes
  roughly the slowest of the three, not the sum.
- **Batch sizing.** If remaining work in a phase has degraded into
  scattered single-file findings with no shared feature area (no more
  natural clusters), the per-PR overhead (worktree setup, PR creation,
  merge, doc updates) starts costing more than the actual fix. Group
  several unrelated small fixes into one PR instead of one PR each —
  every file still gets its own lint check and live verification, just
  under fewer total PR cycles.
- **Build caches.** Check whether a slow verification step has an
  available incremental/cache mode before assuming its cost is fixed.
  Example: `npm run typecheck` cold-compiled the whole project on every
  run (~2m45s) until `tsconfig.app.json`/`tsconfig.node.json` gained
  `incremental: true` + an explicit `tsBuildInfoFile` (PR #548) — a pure
  build-cache change, verified to produce an identical result, that cut
  repeat runs to ~15s (~11x). Re-check this kind of thing doesn't already
  exist before optimizing some other part of the pipeline instead.
- **Don't echo full verbose test output into your own context every
  batch.** `npm run test:edge` alone prints 150-250 lines (every
  individual `✔` across ~260 tests), and it's nearly byte-identical from
  one batch to the next once a phase is steady-state. Pasting that in
  full every single batch (confirmed as a real, avoidable cost across a
  ~26-batch Phase 2.5 stretch on 2026-09-05 — see the execution
  efficiency log) burns a lot of your own context for close to zero
  information, since the tests reliably pass. Capture only the summary
  line (pass/fail/skip counts) from `test:edge` and `test:frontend`
  unless something actually fails — only paste the full output when a
  test fails, since that's the one case the detail is actually needed.
  This does not weaken verification: the full suite still runs and still
  gates the batch, only what you *echo back into your own context*
  changes.

The bar for any of these: does it reduce repeated overhead without
skipping, weakening, or reordering-around a verification step? If yes,
it's fair game to apply proactively, not just when asked.

## Local dev server troubleshooting (Windows)

**`npm run dev` hangs forever at `[optimizer] scanning dependencies...`**
(never reaches `optimized dependencies:`, never errors), and a real browser
(or Playwright/browser-automation) times out waiting for `domcontentloaded`
against `http://localhost:PORT` — even though `curl http://localhost:PORT`
returns 200 instantly (curl only hits the raw `index.html` transform, which
doesn't block on dependency pre-bundling; a real browser's module-script
requests do, and they never resolve while the scan is stuck).

- **Confirmed root cause (2026-08-25):** without an explicit
  `optimizeDeps.entries`, Vite's dependency scanner globs `**/*.html` from
  the project root to find crawl entries. This repo routinely has **nested
  git worktrees checked out inside the repo itself**
  (`.claude/worktrees/<name>/`, `.worktrees/<name>/`, `worktrees/<name>/` —
  created by agent sessions via `git worktree add`), and each one carries its
  own full `index.html` **and its own full `node_modules`**. The scanner
  glob-matches every one of those nested `index.html` files as an additional
  entry point and crawls each worktree's entire dependency tree too — with
  enough worktrees accumulated (a few dozen is normal after months of agent
  sessions), this either takes minutes or hangs outright. Verified with
  `DEBUG=vite:deps npm run dev`: the crawl's entry list included paths like
  `worktrees/pdp-workforce-rls/index.html`, and pinning the entry list fixed
  it immediately (crawl went from hanging indefinitely to completing in
  under 10s).
- **Fix (already applied in `vite.config.ts`):** `optimizeDeps.entries:
  ["index.html"]` (skip the runaway glob, scan only the real entry) plus
  `server.watch.ignored` excluding `**/worktrees/**`, `**/.worktrees/**`,
  `**/.claude/worktrees/**` (stop the dev-server file watcher from tracking
  them too). If this regresses, check `git worktree list` for how many
  worktrees have accumulated under the repo root — cleaning up stale ones
  (`git worktree remove <path>`, never `git branch -d` without asking) also
  shrinks the scan surface.

**False leads investigated first — don't waste time rediscovering these:**
- **Not the Lovable `mcpPlugin()`** — removing it entirely did not change
  the hang.
- **Not the edge-function CORS allowlist work** — that's server-side
  Supabase Edge Function code, with zero interaction with the local Vite
  dev server or its dependency scanner.
- **Not solely stray `node.exe` processes** — killing zombie node processes
  from crashed sessions (`taskkill /IM node.exe /F`, confirm with the user
  first since it's system-wide) sometimes *appeared* to fix it, because a
  fresh process coincidentally raced past the scan once or was retried
  differently — but the hang reliably reproduced again on a genuinely clean
  process/cache state until the `optimizeDeps.entries` fix above was
  applied. Still worth doing as basic hygiene after a crashed session, just
  don't stop investigating if it doesn't resolve the hang.
- **Not IPv4-loopback interception by endpoint-security software** — an
  `SSLKEYLOGFILE` env var pointing at a named pipe (`\\.\nllMonFltProxy\...`,
  backed by `nllToolsSvc.exe`) was observed and briefly looked causal because
  `http://[::1]:PORT` (IPv6 loopback) loaded while `localhost`/`127.0.0.1`
  timed out — but after the real fix, plain `localhost` worked fine too.
  The `[::1]` "fix" was actually just a request timed to land after a
  previous scan happened to finish. Plain `localhost`/`127.0.0.1` work fine
  once the real fix above is in place — no loopback workaround needed.

## Auth / testing gotcha

- The landing route `/` is the **Login** page. All app routes beyond it are
  behind `ProtectedRoute` and require a real Supabase session. Auth methods:
  email+password, magic link (`signInWithOtp`), and Microsoft 365 (Azure OAuth)
  — all against the **production** hosted Supabase. There are **no
  seeded/test credentials** in this environment; standardized QA accounts
  exist in production (Test RTO A / Test RTO B) for anyone with access. The
  password-reset and magic-link flows do reach the live backend and can be
  used to smoke-test connectivity without logging in.

## KB link checker (Phase 1, `docs/kb/reference/codebase-optimization-plan-2026-08-28.md`)

- `npm run check:kb-links` (`scripts/check-kb-links.mjs`) resolves every
  local Markdown link under `docs/kb/**` and in `docs/audit-log/INDEX.md`
  relative to its own file's directory and reports any that don't resolve
  to a real file or directory (anchors are stripped before resolution — it
  checks the target exists, not that the specific heading anchor does).
  Wired into CI (`.github/workflows/kb-link-check.yml`), scoped to only run
  when `docs/kb/**`/the audit index/the checker itself change.
- 2026-09-01: fixed 230 broken KB links + 151 stale `docs/audit-log/INDEX.md`
  links this surfaced (`](audit/...)` → `](entries/...)`, the actual current
  directory). Root causes, for future reference: (1) most KB docs were
  written when they lived one level shallower and never got their `../`
  depth corrected after moving into `docs/kb/<subdir>/`; (2) several
  `reference/`-family docs cross-link by an old numbered-filename scheme
  (`01-architecture.md`, `02-system-design.md`, `05-product-decisions.md`,
  etc.) that no longer exists — those files were renamed/merged (e.g.
  `02-system-design.md`'s content is now inside `architecture.md`) without
  updating the links pointing at them; (3) a handful linked to Claude's own
  session-memory files (`../../memory/*.md`) that were never a repo path in
  the first place — converted to plain backtick text; (4) two docs
  (`dashboard-overhaul-mockup.md`, `ui-explainer.md`) link to a companion
  `.html` file that isn't in the repo — annotated as missing rather than
  fabricated. Zero broken links remain as of this fix; re-run the checker
  before trusting that if it's been a while.

## Playwright browser harness (P0.7/P0.8, `docs/kb/reference/codebase-optimization-plan-2026-08-28.md`)

- `@playwright/test` + `playwright.config.ts` (2026-09-01). The local
  frontend talks to hosted **production** Supabase, so even an
  unauthenticated run against `localhost:8080` is production data access —
  default posture is **read-only**, nothing here writes data.
- `npm run e2e:unauth` — no login needed: Login page at `/` and `/login`,
  reset-password, activate-account (no token → "Invalid Link", not a
  crash), a protected deep link (`/dashboard`) redirecting to `/login`
  without flashing protected content, and the app's own 404 for an unknown
  route. Runs desktop + 375px mobile.
- Authenticated personas need a storage state generated **once** via
  `E2E_EMAIL=... E2E_PASSWORD=... node e2e/auth-setup.mjs <persona-name>`
  (requires `npm run dev` already running in another terminal) — this logs
  in through the real UI and saves session state to
  `playwright/.auth/<persona-name>.json`, which is gitignored and never
  committed. Credentials are read from environment variables for that one
  invocation only; nothing here hardcodes or persists them. Then
  `npm run e2e:personas` runs `e2e/personas/superadmin.spec.ts` (storage
  state `playwright/.auth/superadmin.json`) and `client-demo.spec.ts`
  (`playwright/.auth/client-demo.json`) — both read-only: dashboard/home
  loads, one representative same-persona route, one cross-persona denial
  check (client persona hitting a SuperAdmin-only route). Neither test
  signs out — doing so would invalidate the storage state for every
  subsequent run.
- **Coverage gap, honestly disclosed rather than faked:** only Super Admin
  and the "Demo RTO" client account were available when this harness was
  built. The plan's full persona table also names Vivacity operational
  staff (non-SA), Academy-only, disabled-user, and add-in/Teams personas —
  none of those have a test account here, so there's no spec for them.
  Don't read `e2e:personas` passing as proof those personas work.
- `reuseExistingServer: false` + `strictPort: true` in `playwright.config.ts`
  are deliberate: this must be the dev server *this* worktree/branch just
  started, not another worktree's server left running on 8080 (shared Edge
  CORS only allows `localhost:8080`/`127.0.0.1:8080` — see "Local dev server
  troubleshooting" below). If port 8080 is already owned by another
  worktree, stop and resolve ownership rather than letting Playwright pick
  a different port.
- Chromium binary installs via `npx playwright install chromium` (not
  `--with-deps`, which is a Debian/Ubuntu-only flag that hangs silently on
  Windows with zero output — looks exactly like a stuck process; kill it
  and reinstall without the flag). It's a real ~192 MiB download and can
  take 10+ minutes on a slow connection with no visible progress unless you
  run with `DEBUG=pw:install`.
- `playwright/.auth/`, `playwright-report/`, `test-results/`, and
  `blob-report/` are gitignored (run artefacts can capture what's on-screen
  during an authenticated run, and storage-state files hold live session
  tokens for whatever persona generated them).
- **Known gap:** neither `tsconfig.app.json` (`include: ["src"]`) nor
  `tsconfig.node.json` (`include: ["vite.config.ts"]`) covers `e2e/` or
  `playwright.config.ts`, so `npm run typecheck` doesn't check them, and
  Playwright's own esbuild-based transform doesn't type-check either — only
  runtime errors surface when a spec actually runs. A `tsconfig.e2e.json`
  wired into `typecheck` would close this; not done here to avoid scope
  creep into P0.2's already-shipped script.

## Repo layout

```
./
├── CLAUDE.md            ← Claude Code entry point, imports this file
├── AGENTS.md             ← this file — cross-tool rulebook
├── docs/
│   ├── kb/               ← team knowledge base (migrated from unicorn-kb/)
│   │   ├── pinned/       ← stable team opinion — conventions, decisions, glossary
│   │   ├── reference/    ← longer-form opinion — ADRs, flow patterns, cadence
│   │   ├── codebase-state/ ← as-shipped state docs (module status, architecture, map)
│   │   └── handoffs/     ← scenario-specific procedures
│   ├── audit-log/        ← audit trail (migrated from unicorn-audit/)
│   │   ├── README.md     ← what goes in, template, retrieval
│   │   ├── INDEX.md      ← chronological list
│   │   └── entries/      ← one file per audit event, YYYY-MM-DD-<slug>.md
│   └── ...                ← existing product/feature docs (specs, standards,
│                             integration notes) — unchanged, Lovable reads these
├── src/
├── supabase/
└── ...
```

**`docs/kb/` vs the rest of `docs/`.** The rest of `docs/` is code-adjacent
material Lovable needs in-context while generating features (specs, naming
conventions, integration references, smoke tests). `docs/kb/` and
`docs/audit-log/` are team opinion, decisions, and narrative history — they
are **not** inputs to Lovable prompts.

## Client Portal / Academy route composition

Full detail and rationale: `docs/route-composition-conventions.md` — that
file is code-adjacent (Lovable reads it), so it's the canonical source; this
is a pointer, not a duplicate.

**The short version:** a new page under `/client/*` or `/academy/*` is added
as a child `<Route>` in `src/routes/clientRoutes.tsx` or
`src/routes/academyRoutes.tsx` — never as a new `*Wrapper.tsx` file that
mounts `ClientLayout`/`AcademyLayout` itself. That per-page-wrapper pattern
was retired 2026-09-01 (`docs/kb/reference/codebase-optimization-plan-2026-08-28.md`,
P1.3) specifically because it forced the whole layout — sidebar, a live
realtime channel, the Ask Viv chat panel, a tenant/access check — to
fully remount on every single navigation between pages in the same portal.
Reintroducing a wrapper file for one new page silently breaks that
persistence for every other page in the same portal too, not just the new
one.

Known gap, not a pattern to copy: several Academy pages that predate this
convention (`src/pages/academy/**` — courses list, certificates, workbooks,
events, community, the 3 PDP pages) still wrap `AcademyLayout` themselves
inside the page component. A new Academy page should follow the nested-route
rule above regardless.

## Guardrail: `docs/kb/` and `docs/audit-log/` are off-limits to Lovable

Now that these live inside the same repo Lovable generates against, a remix or
broad prompt could in principle touch them. Treat any Lovable-authored diff
that touches `docs/kb/**` or `docs/audit-log/**` as scope creep — it should
never happen from a Lovable prompt. If it does, flag it and revert that part
of the diff; don't fold it in silently. (Lovable bundling unrequested changes
into an unrelated fix's response is a known failure mode — always diff the
full commit, not just the requested change.)

## Write permissions & branch naming

Direct git hotfix — a hand-written change on a branch, opened as a PR — is the
standing default path for editing this repo. There is no "Lovable's territory,
refuse by default" posture; offering a Lovable prompt instead is a fine
alternative for changes that suit Lovable's generation flow (broader UI work),
but it isn't required.

Branch prefixes:
- `hotfix/<slug>` — bug fixes, hand-applied code changes.
- `chore/<slug>` — docs-only or repo-maintenance changes (e.g. this
  consolidation) that aren't a hotfix in spirit.

Rules, uniformly:
- Never push to `main` directly. The only path to `main` is merging a PR, and
  that always requires a fresh, explicit in-session ask from the user — a
  standing "yes" from an earlier session does not carry over.
- Never force-push.
- Never delete branches or tags without explicit user confirmation.
- Never amend commits that have been pushed.
- Never `git reset --hard` except on a fresh branch just created.

## Concurrent agents in a shared working directory

Carl runs more than one AI coding tool against this repo — Claude Code, Cursor,
and/or Codex may all point at the same local clone, sometimes in the same
session. They share one working directory and one `.git`, so a `git checkout`
run by one tool changes what every other tool sees on disk, silently.

**What actually happened (2026-08-06, see
`docs/audit-log/entries/2026-08-06-ask-viv-client-assistant.md`):** mid-session,
Cursor checked out an unrelated branch (`hotfix/swap-primary-contact-timeline`,
based on a commit from before the in-progress feature branch existed) to work
on a different task. Claude Code had several files edited-but-uncommitted on
`feat/ask-viv-client-assistant` at that moment. The checkout silently reverted
every one of those files on disk back to the unrelated branch's version —
tracked files were overwritten to match the new HEAD, and even one
newly-created-but-never-`git add`ed migration file vanished. Nothing errored;
the only sign was files behaving as if edits had never happened.

**What limited the damage:** the prod Supabase deploys already made that
session (via `deploy_edge_function`/`apply_migration`) were unaffected —
those tools send their full payload inline per call, independent of local
disk state. Only the *local working tree* was clobbered.

**Rules going forward, for any tool reading this file:**
- Before trusting that a file you edited earlier in the session still has
  your edits, check `git status`/`git branch --show-current` if there's any
  chance another tool has touched this repo since — don't assume disk state
  is frozen just because you didn't change it.
- If you need to do substantive multi-file work on a branch, and there's any
  chance another agent/tool session might be active in this same directory,
  work in a **git worktree** (`git worktree add`, or the `EnterWorktree` tool
  in Claude Code) checked out to your actual branch, rather than switching
  the shared working directory's HEAD. Committing from a worktree and pushing
  works exactly like normal — only the checkout step is isolated.
- Never switch the shared working directory to a different branch on the
  assumption that "it's just background work" — the working directory is
  effectively shared, mutable state between tools, and a checkout is a
  destructive operation to anyone else's uncommitted work in it.
- If you discover files matching neither your last edit nor a `git diff`
  against HEAD, don't assume a bug in your own tooling before checking
  `git reflog` for a branch switch that isn't yours.

## Schema / RLS / trigger changes

Any migration, FK constraint, RLS policy, trigger, enum, or data backfill —
whether shipped via a hand-written hotfix or routed through a Lovable prompt —
gets an audit entry in `docs/audit-log/entries/YYYY-MM-DD-<slug>.md` (template
in `docs/audit-log/README.md`). This can land in the same PR as the change or
a quick follow-up docs-only PR. UI-only changes with no migration don't need
one.

For changes routed through a Lovable prompt specifically, read
`docs/kb/handoffs/lovable-production-db-change.md` end-to-end before drafting
the prompt — it covers the phased-prompt workflow (audit → design decisions →
implementation plan → phased implementation → dry-run → verification).

**Guardrail: sweep RPC bodies, not just frontend code, before tightening a
constraint.** Adding `NOT NULL`, a new `CHECK`, or narrowing an existing
column on a table already in use requires checking every write path into
that table — and Postgres functions (`SELECT/RPC` calls from the frontend)
are a write path a frontend-only grep will never find, because the
`INSERT`/`UPDATE` lives inside the function body in the database, not in
`src/`. A real incident (2026-08-12, see
`docs/audit-log/entries/2026-08-12-document-versioning-labels.md`): adding
`document_versions.display_version NOT NULL` broke two RPCs that inserted
into that table without it — one of them genuinely live, so production was
broken until a Vercel PR-review bot caught it, not the pre-migration
testing. Before shipping this kind of change, run both checks:
- Frontend: grep `src/` for `.from('<table>')`.
- Database: `select proname from pg_proc where pronamespace =
  'public'::regnamespace and pg_get_functiondef(oid) ilike
  '%<table>%' and pg_get_functiondef(oid) ilike '%insert%'` (adjust to
  `%update%` too if narrowing rather than adding a column) via a Supabase
  MCP `execute_sql` call. Also check for triggers on the table
  (`pg_trigger` / `pg_get_triggerdef`).

**Guardrail: `apply_migration`/`execute_sql` take plain SQL — never HTML-escape
the query text.** A 2026-08-14 session (see
`docs/audit-log/entries/2026-08-14-bulk-generate-deliver-to-clients-foundation.md`)
passed a migration with `<>`, `->>`, and `"` encoded as `&lt;&gt;`, `-&gt;&gt;`,
`&quot;` — an unforced habit of treating the tool-call parameter like XML/HTML
content. It isn't; it's a JSON string value that becomes the literal SQL sent
to Postgres. The migration failed with a parser error (`missing "THEN"`)
because `p_selections <> 'array'` became literal text `p_selections &lt;&gt;
'array'`. Write SQL exactly as you'd put it in a `.sql` file — no entity
encoding, regardless of what tool or harness is issuing the call.

**Guardrail: changing a Postgres function's parameter list requires `DROP
FUNCTION` first — `CREATE OR REPLACE` silently creates a second overload
instead.** Same session: adding one optional parameter
(`p_batch_id uuid DEFAULT NULL`) to
`record_governance_delivery_and_mark_generated` via `CREATE OR REPLACE
FUNCTION` did not replace the existing 13-arg function — Postgres matches
`CREATE OR REPLACE` targets by exact argument-type signature, so a changed
arity creates a **new overload** sharing the same name and first N parameter
names. Confirmed via `pg_get_function_identity_arguments` that both the old
13-arg and new 14-arg versions existed simultaneously after the migration —
a call-resolution ambiguity risk for any caller still using the original
parameter set. Whenever a migration adds, removes, or reorders a function's
parameters (not just its body), `DROP FUNCTION IF EXISTS
public.fn_name(old, arg, types);` before the `CREATE OR REPLACE`, and verify
afterward with `select pg_get_function_identity_arguments(oid) from pg_proc
where proname = '<fn_name>'` — it should return exactly one row. This also
applies to functions with `RETURNS TABLE(...)`: Postgres additionally refuses
the replace outright with `cannot change return type of existing function`
if the output column set changed, so the drop-first step is required there
too, not just recommended.

**Guardrail: a new column on a per-column-grant table needs an explicit
`GRANT SELECT` for every role that queries it — adding the column is not
enough.** `public.users` uses per-column grants rather than a table-wide
`GRANT SELECT`, so PostgREST returns 403 for *any* query that references an
ungranted column — even just in a `.eq()`/`.filter()` clause, not only in
`.select()`. A real incident (2026-08-25, see
`docs/audit-log/entries/2026-08-25-grant-authenticated-select-is-system-account.md`):
the same-day `hide_system_accounts_from_staff_lists` migration added
`public.users.is_system_account` and patched 9 frontend call sites to filter
on it, but granted `SELECT` only implicitly (`anon`/`service_role`/`postgres`
picked it up, `authenticated` did not) — every one of those 9 call sites
403'd for every logged-in user until a follow-up grant. Before shipping a
migration that adds a column to `public.users` (or any other table using
per-column grants — check with `select grantee, privilege_type from
information_schema.column_privileges where table_name = '<table>'` before
assuming table-wide grants apply), include `GRANT SELECT (<new_column>) ON
public.<table> TO authenticated;` (and any other role — `anon`,
`service_role` — that legitimately queries it) in the same migration, and
verify with `select grantee, privilege_type from
information_schema.column_privileges where table_name = '<table>' and
column_name = '<new_column>'` before considering the migration done.

**Guardrail: a batch upsert/insert into a table whose FK targets `auth.users`
fails entirely if any one row references a `public.users` profile with no
matching auth account — always check the error and fall back to per-row.**
`conversation_participants.user_id` FKs to `auth.users(id)`, not
`public.users`. A real incident (2026-08-25, see
`docs/audit-log/entries/2026-08-25-broadcast-notification-silent-participant-failure.md`):
`send-broadcast-campaign`'s client-participant upsert (sourced from
`tenant_users`, which can drift out of sync with `auth.users` — e.g. seeded
fixture profiles, or a real client's auth account that was never provisioned
or was later deleted) had no error check at all. When one tenant_users row in
the batch had no matching `auth.users` row, the FK violation failed the
*whole* batch upsert — silently dropping every legitimately reachable
participant for that tenant, not just the bad one. The broadcast still
reported "sent," the message still existed, but zero client participants
(and therefore zero `user_notifications` rows, since those come from an
INSERT trigger on `tenant_messages` scoped to actual participants) were
created for two tenants, including one still-active real client. The
identical unguarded pattern existed a second time in
`src/pages/TeamCommunicationsPage.tsx`'s "start new conversation" flow (it
threw instead of silently swallowing, but had the same all-or-nothing
exposure — one bad row meant staff could never message that tenant at all).
Any code upserting a batch of rows into a table with an FK to `auth.users`
must check the upsert's error and, on failure, retry row-by-row so one bad
row only costs that one row — and log (never silently swallow) whichever
rows get skipped.

## Edge Function security guardrails (from the 2026-08-18 audit)

The 2026-08-18 architecture/security remediation session (see
`docs/claude-security-architecture-audit-handoff-2026-08-18.md` and the
`docs/audit-log/entries/2026-08-18-*` entries) found a recurring family of
gaps across `supabase/functions/**`. These rules exist to stop the same class
of bug reappearing in a new function, not just to document what was fixed.

**New edge function checklist — before merging any new function that reads
`Authorization` or touches a DB table:**
- It imports and calls `requireCaller` (or `requireSharedSecret` /
  `requireInternalEmailSecret` / cron-secret gating for machine-to-machine
  calls) before any DB read/write branch — not just before the "risky"
  branch. (`import-unicorn1-client` ran its destructive clear before an
  existence check that lived deeper in the function; `sync-clickup-tasks` had
  no gate at all on some modes.)
- Every mode/branch of a multi-action function (`action: "x" | "y" | "z"`
  style bodies) is covered by the same gate — auditing only the default
  branch and assuming the others "inherit" the check is how a gate gets
  half-applied.
- Any TypeScript union type used to constrain a request body field
  (`role: 'Admin' | 'General User'`) has a matching **runtime** `Set`/allowlist
  check. The compiler only constrains code that already assumes a valid
  shape; it does not validate an attacker-controlled JSON body. See
  `bulk-user-action`'s `ALLOWED_ROLES` and `dashboard-test-seed`'s
  `TEST_SEED_TENANT_IDS` allowlist for the pattern.
- Destructive or state-mutating operations run their validation/existence
  checks **before**, not after, the mutation — ordering bugs here are easy to
  introduce when a function grows an `if (opts.x)` branch around a
  pre-existing validation step.
- Any action gated only by a broad role check (e.g. `staff.internal`, held
  by every internal role) that is meaningfully more consequential than
  other actions behind the same gate (suspend/close vs. read-only staff
  actions) gets its own `checkSuperAdmin`-tier check, matching whatever
  precedent already exists in that function for its most sensitive actions.
  (`tenant-lifecycle` gated archive/reactivate-from-archived on SuperAdmin
  but originally left suspend/close on the broader `staff.internal` gate.)
- Any caller-supplied identifier used to fetch or act on an external
  resource (a SharePoint drive/item ID, an external file path) is validated
  against a server-resolved value, never trusted as-is — a caller passing an
  arbitrary `source_drive_id` must not be able to make the function read
  from a drive/tenant that isn't the intended one.
- Any URL-building helper that joins a caller- or config-supplied path onto
  a base URL anchors unconditionally to that base's origin (`joinAppUrl`)
  rather than passing through a path that already looks like an absolute
  URL — that passthrough is an open-redirect vector.

**Guardrail: refactoring a function's auth gate means re-checking its
`*.test.mjs` file too — these tests were never run as part of the normal
test command until 2026-08-26, so several had gone stale.** A 2026-08-26
session ran `npm run test:edge-functions` (previously never wired up, see
F-022 in `docs/audit-report-2026-08-26.md`) and found 4 of 220+ tests
failing: three were stale regexes that hadn't been updated after the
shared `json()`/`jsonErr()` helpers in those functions were changed to take
`req` as their first argument (a one-line fix each); the fourth
(`bulk-generate-documents-worker/auth-gate.test.mjs`) was asserting the
*old* JWT-decode auth model that a later, well-documented architecture
change (shared-secret + dedicated system account, see that function's own
"Auth model" header comment) had deliberately superseded — the test was
rewritten rather than patched. When you change a function's auth gate
(swap in `requireCaller`, add `requireSharedSecret`, change a helper's
signature), update or rewrite its `*.test.mjs` in the same change, and
actually run `npm run test:edge` (renamed from `test:edge-functions` in
P0.2) before considering the change done — don't rely on the file existing
as proof it still passes.

**CI/lint follow-up (not yet implemented, worth adding):** a check that
flags any new or modified file under `supabase/functions/*/index.ts` with no
`requireCaller`/`requireSharedSecret`/`requireInternalEmailSecret`/cron-auth
import, and a check that rejects a second `_shared/requireCaller*.ts` or
`_shared/auth-helpers*.ts`-named file (duplicate implementations of the same
auth gate are how a fix lands in one copy and not the other).

**Trigger-based authorization caveat:** a Postgres trigger that checks
`current_setting('request.jwt.claim.role', true)` to distinguish "browser
call" from "trusted service call" provides **no protection** against an
edge-function-originated write, because every edge function authenticates to
Postgres as `service_role`. Treat such a trigger as covering only direct
PostgREST/browser writes; the edge function's own `requireCaller` gate and
app-layer allowlist are the actual defense for anything invoked from
`supabase/functions/**`. (Found in `enforce_invitation_role_ceiling` on
`user_invitations` — parked as a follow-up, not fixed in this session.)

## Supabase deployment workflow

Deploy hosted Supabase migrations and Edge Functions through the configured
Supabase MCP tools. Do not rely on GitHub Actions or the Supabase CLI for
production deployment; the repository intentionally has no automatic
Supabase deployment workflow because production migration history may contain
MCP-applied changes that are not present in every checkout.

## Session end (commit conventions)

Conventional-commits style: `fix:`, `feat:`, `hotfix:`, `chore:`, `docs:`,
`audit:`. PR description includes what changed, and for schema/RLS/trigger
work, a pointer to the audit entry. Default: do not auto-merge — stop after PR
creation; merge only on explicit in-session instruction.
