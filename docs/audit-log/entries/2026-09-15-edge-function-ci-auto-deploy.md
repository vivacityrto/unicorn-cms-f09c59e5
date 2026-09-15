# Audit: 2026-09-15 — Reliable, dependency-aware Edge Function auto-deploy via CI

**Trigger:** Carl asked directly why manual Edge Function redeployment was costing so much (both token cost and his own time), whether the repo just syncs to Supabase automatically, and to set up a GitHub Action so deployment "works seamlessly" — including correctly handling shared/bundled dependencies (his named example: Ask Viv's shared corpus/fact-builder modules).
**Scope:** new `.github/workflows/deploy-edge-functions.yml`, new `scripts/select-affected-edge-functions.mjs` (+ its test), and an `AGENTS.md` rewrite of the "Supabase deployment workflow" section.

## Why this was needed

Supabase's native dashboard GitHub-sync integration (the only prior auto-deploy mechanism) has been documented as unreliable since 2026-09-07 — it worked once, then silently failed to deploy 7 of 7 changed functions in a same-day merge, with no diagnosed root cause. The standing mitigation was a manual process: check each changed function's deployed version ~15 minutes post-merge, and if it hadn't advanced, hand-reconstruct that function's full local-import dependency closure (via `git show origin/main:<path>` for every file) and deploy via `mcp__supabase__deploy_edge_function`.

That manual process was exercised extensively earlier today (2026-09-15) after the `verifyAuth`/`ask-viv-access.ts` account-status security fix (see `docs/audit-log/entries/2026-09-15-fix-verify-auth-dead-account-status-check.md`) — 15 functions needed redeployment because they all import the fixed shared files. It was expensive (large token cost reconstructing file lists by hand across several agent sessions) and error-prone: one function (`vector-search`) initially failed to deploy because its dependency closure was hand-computed and missed that `ask-viv-access.ts` itself imports `requireCaller.ts`; another round missed that three AI-assistant functions import a whole shared subdirectory (`_shared/ask-viv-fact-builder/`) that a flat `_shared/*.ts` grep never surfaced. Both gaps were only caught because a live bundler error surfaced them — the exact failure mode this change is built to prevent from ever reaching that point.

## What was built

1. **`scripts/select-affected-edge-functions.mjs`** — given a set of changed files (or a git diff range), computes the real set of deployable Edge Functions whose bundle is affected. It builds each function's dependency closure by parsing local relative imports (`from "../_shared/X.ts"`, `from "./Y.ts"`, etc.) starting from `index.ts` and following them transitively — the same resolution Deno's own bundler performs — then answers "which functions' closures include this changed file" for the actual diff. This is the exact computation that was previously done by hand, expensively and with real gaps.
2. **`scripts/select-affected-edge-functions.test.mjs`** — asserts against the real current repo: a function's own `index.ts` change affects only itself; a widely-shared file's change affects many functions; a nested shared subdirectory module is followed transitively (regression test for the exact `ask-viv-fact-builder/` gap found earlier today); an unrelated function's change doesn't cross-contaminate; a no-match diff returns nothing.
3. **`.github/workflows/deploy-edge-functions.yml`** — on push to `main` touching `supabase/functions/**`: runs the selector script's self-test, computes the affected set from `github.event.before`/`github.sha` (falling back to `--all` if `before` is the all-zero SHA, e.g. a force-push), then for each affected function runs `supabase functions deploy <name> --project-ref <SUPABASE_PROJECT_ID>` via the official Supabase CLI (`supabase/setup-cli@v1`), authenticated with the existing repo secret `SUPABASE_ACCESS_TOKEN` (already present in this repo, used by an existing QA workflow — no new secret needed). The Supabase CLI bundles each function's real import graph directly from the checked-out filesystem, eliminating the "hand-reconstruct file list, retype content into a tool call" step entirely — there is no hand-typed file list anywhere in this path now.
4. **`AGENTS.md`** — rewrote the "Supabase deployment workflow" section: kept the historical incident record (why the dashboard integration isn't trusted), replaced the "check ~15 min post-merge, deploy manually" standing practice with a description of the new CI workflow, and recommends disabling the native dashboard GitHub-sync integration to avoid a redundant/racing second deploy (a Supabase-dashboard setting, not fixable from the repo — flagged for Carl to action separately).

## Decisions

- Deploy exactly the affected set per push, not all ~196 functions unconditionally — deploying everything every time would be simple but slow and mostly wasteful (most changes touch 1-3 functions and no shared file); the dependency-aware selection gives the same correctness guarantee (nothing shared-file-dependent gets missed) without the cost.
- Chose the Supabase CLI (`supabase functions deploy`) over continuing to use the raw `deploy_edge_function` MCP tool for this automated path specifically because the CLI bundles from the real filesystem — it cannot have the "forgot a file" class of bug the manual process just had twice today. The MCP tool remains the right choice for an interactive session doing a one-off, already-live-verified deploy outside of CI.
- Did not attempt to also automate migrations through this workflow — `AGENTS.md`'s existing rule that migrations stay MCP-controlled (`apply_migration`) is unchanged and this entry doesn't touch it.
- Flagged, not done: disabling the Supabase dashboard's native GitHub-sync integration for Edge Functions — that's a dashboard setting outside any tool available in this session; recommended to Carl rather than assumed.

## Verification

- `node --test scripts/select-affected-edge-functions.test.mjs` — 5/5 pass.
- Ran the selector locally against the actual diff spanning today's `auth-helpers.ts`/`requireCaller.ts` fixes: correctly surfaced ~109-113 affected functions (confirming `requireCaller.ts`'s real, wide blast radius, which had been estimated but not proven exactly before this tool existed).
- `npx eslint` on both new script files — clean, no errors.
- The workflow's embedded shell logic (affected-count computation, the all-zero-SHA fallback branch) was manually exercised locally against real before/after refs before being written into the workflow file, not just written and assumed correct.
- Did not exercise the workflow end-to-end in real GitHub Actions as part of this entry (that requires an actual merge to `main`, which is exactly this change's own deploy path — will be proven live the first time a merged PR touching `supabase/functions/**` runs it).

## Open questions parked

- **Disable the Supabase dashboard's native GitHub-sync integration** — recommended above, not actioned (dashboard-only setting, needs Carl).
- First real end-to-end run of this workflow (on the next merge touching `supabase/functions/**`) should be watched once to confirm it behaves as designed in the real GitHub Actions environment, not just in local simulation.
- Whether `supabase functions deploy` should run with any additional flags (e.g. `--no-verify-jwt` overrides) beyond what `supabase/config.toml`'s per-function `[functions.<name>]` blocks already declare — not needed today since the CLI reads that config automatically, but worth knowing if a future function needs a setting not expressible there.
