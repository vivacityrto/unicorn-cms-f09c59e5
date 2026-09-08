# Skip typecheck/lint-ratchet/migration-safety CI on docs-only PRs

**Date:** 2026-09-08

**Packet:** ad hoc, not part of Phase 2.6 — CI cost investigation Carl asked for directly

**Scope:** 3 workflow files, no code/schema change

**Hosted state changed:** no — GitHub Actions configuration only

## Decision

Carl asked whether a docs-only PR still runs the full CI check suite, whether
that costs real time, and whether a tagging mechanism could skip checks for
docs-only PRs. Investigated the actual workflow triggers rather than
guessing: `typecheck.yml` and `lint-ratchet.yml` both run unconditionally on
every PR (`on: pull_request:` with no path filter), each performing a full
`npm ci` — typecheck alone took 1m20s–1m41s and lint-ratchet ~22–39s across
this session's own PR runs — plus `migration-safety.yml` unconditionally
re-scans the entire `supabase/migrations/**` tree regardless of whether any
migration changed. Only `kb-link-check.yml` was already path-filtered
(`docs/kb/**` only). None of this depends on anything docs-related.

Recommended GitHub Actions' native `paths-ignore` trigger filter over a
manual PR-label/tag mechanism — it's automatic (nobody has to remember to
apply a label), can't be bypassed by mislabeling a PR that actually touches
code, and GitHub only skips a workflow when *every* changed file in the PR
matches the ignore list (a PR touching both docs and code still runs
everything).

Checked for the standard risk with this pattern first: a required-status-check
branch protection rule can leave a PR stuck "waiting for status" forever if
its required check is skipped rather than run. Confirmed via `gh api
repos/.../branches/main/protection` (404, none configured) and `gh api
repos/.../rulesets` (only a "restrict deletions" ruleset exists) that this
repo has **no required-status-check protection at all** — so this change
carries no risk of stuck PRs.

Carl confirmed this repo-level workflow change applies uniformly regardless
of which tool opens the PR (Claude Code, Cursor, Codex, or a human) — GitHub
only evaluates the PR's diff against the path filter, never the author.

## Implementation

Added `paths-ignore: ['docs/**', '**/*.md']` to the `pull_request:` trigger
of:
- `.github/workflows/typecheck.yml`
- `.github/workflows/lint-ratchet.yml`
- `.github/workflows/migration-safety.yml` (its `pull_request:` trigger only
  — the `push: branches: [main]` trigger, a post-merge safety net rather than
  something that costs PR-wait time, was left unconditional)

Deliberately **not** applied to `edge-function-auth-guardrails.yml` or
`email-redirect-guard.yml` — both are already cheap (no `npm ci`, no
dependency install, just a direct script run against the checkout), so the
marginal savings didn't seem worth the added review surface. `kb-link-check.yml`
already has its own (inverted) path filter and needed no change.

`**/*.md` was chosen deliberately broad (any markdown file anywhere, not just
under `docs/`) since a markdown file's location never affects TypeScript
compilation, ESLint, or migration safety — this also covers root-level docs
like `README.md`/`CONTRIBUTING.md`/`AGENTS.md`/`CLAUDE.md`.

## Postflight

- Validated all three edited files as syntactically valid YAML.
- `node scripts/check-kb-links.mjs`, `LINT_RATCHET_BASE=origin/main node
  scripts/lint-ratchet.mjs`, `node scripts/audit-migrations.mjs`,
  `npm run typecheck`, `npm run test:frontend`, `npm run build` — all clean
  (no `.ts`/`.tsx` files changed in this PR).
- This PR itself, being workflow-file-only rather than docs-only, still runs
  its own typecheck/lint-ratchet checks under the new rules (confirms the
  filter doesn't accidentally skip verification of a change to the filter
  itself).
- Not independently verifiable pre-merge: GitHub Actions' actual skip
  behavior for a genuinely docs-only PR can only be observed by opening one
  after this merges — flagged here rather than assumed.
