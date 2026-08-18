# Audit: 2026-08-18 — unauthenticated batch/compute engines gated

**Trigger:** drift-surfaced — found while sanity-testing the new `check-edge-function-auth-gate.sh` CI check (`docs/audit-log` entry for that PR) against every currently-shipped edge function, not during a planned review of these functions specifically.
**Scope:** 11 `supabase/functions/**` functions identified as having zero authorization. 10 fixed here; 1 (`summarize-daily-notes`) investigated and confirmed already correct.

## Findings

Running the new auth-gate pattern against all 215 shipped functions surfaced 57 without a recognized pattern. Most were expected (retired 410 stubs, OAuth-callback token flows, genuinely public lookups). Eleven were not — full-blown service-role batch/compute engines with **no authorization of any kind**:

`run-retention-forecast`, `run-stage-health-monitor`, `run-tenant-risk-forecast`, `run-workload-forecast`, `run-strategic-signal-analysis`, `run-workflow-optimisation`, `calculate-predictive-risk`, `risk-command-engine`, `scorecard-refresh`, `strategic-orchestration`, `summarize-daily-notes`.

All 11 are `verify_jwt: false` at the platform level (standard for this codebase, which does its own auth in-function) — combined with no in-body check, this meant each was **fully invokable by anyone on the internet with no credentials**, triggering full-tenant recomputation of risk/health/forecast data or an LLM call, on demand, repeatedly.

Investigated each function's actual invocation model before designing a fix, rather than applying one blanket pattern:

- **Confirmed nightly `pg_cron` jobs** (`run-retention-forecast-nightly`, `run-stage-health-monitor-nightly`, `run-tenant-risk-forecast-nightly`, `run-workload-forecast-nightly`) already send `x-cron-invoke-secret` — the functions just never checked for it.
- **Claimed scheduled/event-driven in their own header comments, but no `pg_cron` job, DB trigger/webhook, or edge-function caller found anywhere** (`run-strategic-signal-analysis`, `run-workflow-optimisation`, `calculate-predictive-risk`, `risk-command-engine`) — checked `cron.job`, `pg_trigger` definitions, and grepped `src/` and `supabase/functions/**` for `functions.invoke(...)` callers. Same "no caller ever found" situation the 2026-08-17 `schedule-task-reminders` audit entry describes.
- **`scorecard-refresh`** had an existing check, but it only verified an `Authorization` header was *present* — any non-empty string satisfied it, authenticating nothing. No `pg_cron` job or caller found either.
- **`strategic-orchestration`** is called from the frontend (`src/hooks/useStrategicOrchestration.ts` → `useRunOrchestration()`), whose route (`/admin/strategic-orchestration` in `src/App.tsx`) is already `ProtectedRoute`-gated with `requireSuperAdmin` — but the edge function itself had nothing stopping a direct call bypassing the UI.
- **`summarize-daily-notes`** is also frontend-called (`src/components/task-notes/useNotesSummary.ts`), and initially looked ungated by the auth-gate script's pattern list — but reading it showed it already verifies the caller's JWT via `supabase.auth.getClaims(token)` and rejects any request where the requested `user_id` doesn't match the authenticated caller (`403 Forbidden`). This is a real, working self-scope check; the gap was in the CI script's recognized-pattern list (`auth.getClaims(` wasn't in it), not in this function. No code change needed here — the CI script's pattern list was extended instead.

## Fix

- The 4 confirmed-cron functions and the 4 no-caller-found functions and `scorecard-refresh` (9 total) were gated with the existing `isCronAuthorized`/`cronUnauthorizedResponse` pattern from `_shared/cron-auth.ts` — the same helper already proven in `process-notification-outbox` and others. For the 4 with no confirmed caller, this mirrors the `schedule-task-reminders` precedent: gate on the standing pattern rather than invent a caller identity; if genuinely nothing calls them, gating breaks nothing, and if something undiscovered does, it will now 401 and surface in logs.
- `strategic-orchestration` was gated with `requireSuperAdmin` from `_shared/requireCaller.ts`, matching its frontend route's own access control.
- `summarize-daily-notes`: no code change. `scripts/check-edge-function-auth-gate.sh`'s pattern list was extended to recognize `auth.getClaims(` (separate PR, `chore/edge-function-auth-guardrail-ci`).

## Code changes

- 10 files under `supabase/functions/**`, each a small (8-14 line) diff adding an import and a gate check immediately after the existing `OPTIONS` handling, before any DB access.
- No frontend changes.
- Not yet deployed to production — source-controlled PR pending review, per the standing "PR first, deploy on explicit ask" convention.

## Decisions

- Did not attempt to identify or reconstruct a "real" caller for the 4 no-caller-found functions beyond gating on the shared cron pattern — same judgement call as `schedule-task-reminders`. If Carl confirms none of these are actually needed, a future session can retire them the same way `schedule-task-reminders` and `assign-package-to-tenant` were.
- Did not touch `summarize-daily-notes`'s code — it was already correct; only the CI check's pattern list needed updating.

## Open questions parked

- Whether `run-strategic-signal-analysis`, `run-workflow-optimisation`, `calculate-predictive-risk`, and `risk-command-engine` are actually invoked by anything today (no caller found in this repo, its cron jobs, or its DB triggers) — worth a direct ask to Carl about whether these are dead/aspirational features, same as `schedule-task-reminders` turned out to be.
- The broader 57-function "no recognized auth pattern" list from the CI check's sanity scan was not exhaustively triaged beyond these 11 plus a few spot-checks (retired stubs, OAuth callbacks, `xero-webhook`'s signature check) — a full pass may surface more of the same class and would be a reasonable scope for a dedicated future session.
