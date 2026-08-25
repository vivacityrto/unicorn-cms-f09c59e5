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
- Lint: `npm run lint`. NOTE: the codebase currently reports **many thousands
  of pre-existing eslint errors** (including in `supabase/functions/**`); a
  non-zero exit is the current baseline, not an environment problem.
- Tests: there is **no `test` script in `package.json`** despite
  `CONTRIBUTING.md` referencing `npm run test`. Run the vitest suite directly
  with **`npx vitest run`** (watch mode: `npx vitest`). A handful of tests fail
  on a clean checkout (e.g. a `supabase.auth.getUser is not a function` mock
  gap and an RBAC public-route expectation) — these are pre-existing, not
  environment issues.

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
