# Allow tenant-less users to save notification preferences

**Date:** 2026-09-08

**Packet:** Phase 2.6 stabilization Packet P4-D, L10 item #18 — the last remaining P4-D item

**Scope:** one migration (schema + 2 function bodies), plus an unrelated audit-tooling bug fix surfaced while shipping it

**Hosted state changed:** yes — `user_notification_prefs.tenant_id` is now nullable, plus a new partial unique index and two function redefinitions; no existing rows touched (17 rows total, all already tenant-scoped)

## Decision

Carl asked to break down the feature/bug/reason before deciding, then investigated further: found the 72 tenant-less `public.users` rows are not a single homogeneous "staff" population — confirmed live via SQL. Carl explicitly deferred the tenant-assignment question (who among those 72 should be tied to the real "Vivacity Coaching & Consulting" tenant, id 6372) to the architectural redesign / RBAC v6 plan rather than deciding it as a side effect of this fix — documented as a parked decision in both
`docs/kb/reference/tenant-operating-model-data-architecture-plan-2026-09-02.md`
§18 item 14 and `docs/kb/reference/rbac-v6-authorization-implementation-plan-2026-09-01.md`
§13 item 15.

Carl then explicitly authorized proceeding with the original, narrower fix: make the `NOT NULL` constraint stop blocking the feature, regardless of which real tenant any given user eventually gets assigned to. This is deliberately the "Allow NULL tenant_id" option from the three previously discussed — the other two (a separate tenant-less storage path, or hiding the UI for tenant-less accounts) were not chosen.

## Implementation

`supabase/migrations/20260908070000_allow_tenant_less_notification_prefs.sql`:

1. `ALTER TABLE user_notification_prefs ALTER COLUMN tenant_id DROP NOT NULL` — a tenant-less user gets one global preferences row.
2. `CREATE UNIQUE INDEX ... (user_id) WHERE tenant_id IS NULL` — the existing `UNIQUE (user_id, tenant_id)` constraint never catches duplicate NULL-tenant rows for the same user (standard SQL `NULL <> NULL` semantics); this partial index closes that gap without touching the original constraint, which still governs every tenant-scoped row.
3. `get_user_notification_prefs`: `WHERE tenant_id = v_tenant_id` is never `TRUE` when `v_tenant_id` is `NULL` (`NULL = NULL` evaluates to `NULL`, not `TRUE`) — a tenant-less user's own row would never be found even after step 1, and the function would try to `INSERT` a fresh default row on every single read. Fixed with `IS NOT DISTINCT FROM`.
4. `update_user_notification_prefs`: `ON CONFLICT (user_id, tenant_id)` only arbitrates against the constraint from step 2's problem — a tenant-less user's *second* save would silently `INSERT` a duplicate row instead of updating the first, even after steps 1–3. Branched the function on whether `v_tenant_id IS NULL` so each path names the correct conflict arbiter (the new partial index for NULL, the original constraint otherwise) — this preserves the atomic upsert guarantee for both cases rather than falling back to a non-atomic update-then-insert-if-missing pattern.

No `DROP FUNCTION` needed for either function — neither's parameter list or return type changed, only the body.

A third, pre-existing function with the identical bug pattern, `set_user_notification_prefs`, was found during investigation (`ON CONFLICT (user_id, tenant_id)`, same NULL gap) but confirmed to have **zero live callers** anywhere in `src/`/`supabase/functions/` — it only appears in the generated TS types. Left untouched; flagged here rather than silently fixed, since fixing dead code adds review surface for zero behavioral benefit.

No frontend changes were needed — `useNotificationPrefs.ts` already calls both RPCs generically and doesn't know or care about `tenant_id`.

**Unrelated bug found and fixed while shipping this:** `scripts/audit-migrations.mjs`'s `isAllowlisted()` required an exact `targetProject` string match, but `data-mutation`/`destructive-mutation` findings from a plain `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` match never set a `targetProject` at all (only `production-url`/`cron-registration`/`cron-unschedule`/`http-call` findings do) — meaning no such finding could ever be allowlisted, contradicting the tool's own error message. This affects 3,617 historical findings repo-wide (confirmed via a full, non-diff-scoped scan) but was invisible until a *new* migration's DML-inside-a-function-body finding needed to actually be allowlisted, which is exactly this migration's situation. Fixed narrowly: `isAllowlisted` now only requires the `targetProject` match when a finding actually carries one (`finding.targetProject === undefined || entry.targetProject === finding.targetProject`) — this has zero effect on the URL/cron/http-call categories, which always set a real `targetProject` and still require an exact match (covered by a new regression test asserting a mismatched `targetProject` is still correctly rejected for those categories). Two new tests added to `scripts/audit-migrations.test.mjs`.

Timestamp collision found and fixed in passing: the migration was originally authored as `20260908060000_...`, which collided with an already-merged same-day migration (`20260908060000_retire_workload_forecast_cron.sql`) — renamed to `20260908070000_...` before applying.

## Postflight

- Applied live via Supabase MCP `apply_migration`. Verified directly by impersonating two real accounts' JWTs inside a rolled-back transaction (`set local request.jwt.claims`, `rollback` after):
  - Carl's own account (`carl@vivacity.com.au`, one of the 72 tenant-less users): `get_user_notification_prefs()` now returns real defaults instead of a 400; two sequential `update_user_notification_prefs()` calls produced exactly one row (`tenant_id: null`), with the second call's fields correctly merged via `COALESCE` rather than creating a duplicate.
  - A real tenant-scoped user: same two-write test produced exactly one row with the correct `tenant_id`, confirming the existing (already-working) path is unaffected.
- `node scripts/check-kb-links.mjs`, `LINT_RATCHET_BASE=origin/main node scripts/lint-ratchet.mjs`, `node scripts/audit-migrations.mjs --changed-only --base-ref origin/main` (0 blocking after the allowlist entry + script fix), `npm run typecheck`, `npm run test:frontend`, `npm run build`, `node --test scripts/audit-migrations.test.mjs` (6 passed, including the 2 new regression tests) — all clean.
- Live UI click-through not performed — this is a pure backend fix with no frontend change, and the DB-level impersonation test above already exercises the exact same RPC calls the UI makes.

## Open questions parked

- Which real tenant each of the 72 tenant-less users should be assigned to (if any) — see the two parked decision-doc entries referenced above. Not answered or actioned here.
