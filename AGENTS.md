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
