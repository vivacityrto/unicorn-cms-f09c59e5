# Audit: 2026-09-15 — Unauthenticated-scope write bypass in `upsert_rock_with_parenting`

**Trigger:** ad-hoc, surfaced while investigating `eos.rocks.own.manage` as a candidate second bounded vertical slice for the RBAC v6 golden-matrix worksheet (following the `eos.scorecard.manage` / P1-w precedent)
**Scope:** `public.upsert_rock_with_parenting` (the RPC backing `RockFormDialog.tsx`'s "Edit Rock" / "Create New Rock" form) and the three parallel write paths into `public.eos_rocks`. Did not investigate other EOS tables' RPCs beyond confirming the fix pattern already used elsewhere (`seed_meeting_attendees_from_roles`, `sync_l10_meeting_participants`).

## Findings

- Tracing `eos.rocks.own.manage`'s actual write paths (per P1-e's open item: "own-resource relationship and team/company distinction need child-hook tracing") found **three independent, unreconciled write surfaces into `eos_rocks`**, not one:
  1. `useEosRocksHierarchy.tsx`'s `createRock` (direct `.insert()`, RLS-bound) — used by the three "Create X Rock" dialogs. Its sibling `updateRock`/`archiveRock` in the same hook are defined but have **zero call sites** (dead code).
  2. `useEos.tsx`'s `useEosRocks()` — its own separate `createRock`/`updateRock`/`deleteRock` (direct `.insert()`/`.update()`/`.delete()`, RLS-bound). Only `updateRock` has a live caller (`RockProgressControl.tsx`, status-only changes); `deleteRock` has **zero call sites** (dead code) despite hard-delete existing at the table layer.
  3. **`public.upsert_rock_with_parenting(p_payload jsonb)`** — a `SECURITY DEFINER` RPC, the actual live write path behind `RockFormDialog.tsx`'s Edit form (every "Edit" button on every visible rock routes here for both create-with-parenting and update).
- `upsert_rock_with_parenting` had **zero internal authorization check** — no `is_vivacity_team_safe()`, no `is_super_admin()`, no role or tenant-membership check of any kind before performing its `INSERT`/`UPDATE` against `eos_rocks`.
- Confirmed this was a real, live bypass, not just a missing-belt-and-braces redundancy:
  - `eos_rocks` has `relrowsecurity = true` but `relforcerowsecurity = false`, and its owner is `postgres`.
  - `upsert_rock_with_parenting` is owned by `postgres` and is `SECURITY DEFINER` — so its internal writes execute as the table owner, which Postgres **exempts from RLS** whenever `FORCE ROW LEVEL SECURITY` is not set. The function's writes were not subject to `eos_rocks`' RLS policies at all, regardless of how well-scoped those policies are.
  - `EXECUTE` on the function is granted to `authenticated` (confirmed via `information_schema.routine_privileges`) — any signed-in user, staff or client, not just Vivacity internal staff.
  - Net effect: **any authenticated user could call this RPC directly (bypassing the UI's disabled-button gate entirely) to create or edit any EOS rock in Vivacity's own tenant (6372)** — reassign ownership, change scope (individual → company), rewrite title/description/status, or fabricate new rocks — with no authorization check anywhere in the path.
- Separately re-verified `has_any_eos_role()` (used in `eos_rocks`' own RLS policies) is hardcoded `_tenant_id = 6372 AND ...` — it cannot grant client-tenant access regardless of `eos_user_roles` row content, so the RLS policies themselves are not the client-tenant leak this session's earlier `retire-client-eos-access` work found in `eos_scorecard`/other tables. This specific RPC bypass is a different, unrelated gap from that earlier fix.

## Code changes (this entry accompanies one)

- Migration `gate_upsert_rock_with_parenting_vivacity_team_only` (already applied via Supabase MCP, committed for repo history): adds `IF NOT public.is_vivacity_team_safe(auth.uid()) THEN RAISE EXCEPTION 'Forbidden: staff only'; END IF;` as the first statement in `upsert_rock_with_parenting`'s body, matching the same gate already used for equivalent EOS staff-only RPCs (`seed_meeting_attendees_from_roles`, `sync_l10_meeting_participants`). No other behavior changed — same signature (`CREATE OR REPLACE`, no arg change), same parenting/upsert logic. Every legitimate current caller (`RockFormDialog.tsx`, reached only through the EOS route guard `canAccessEOS()` — Vivacity internal staff only) is unaffected.

## Decisions

- Fixed immediately rather than deferred, matching this session's established same-day-fix precedent for the `eos_scorecard`/`eos_rocks` client-tenant RLS gap found earlier (`retire-client-eos-access`, 2026-09-15) — this is a more severe class of gap (full write bypass for any authenticated user, not a scoping leak) and was live in production.
- The dead `archiveRock`/`deleteRock`/(unused-branch) `updateRock` functions are **not** removed here — flagged as a follow-up dead-code cleanup, out of scope for this security fix.
- Consolidating the three parallel `eos_rocks` write surfaces into one is **not** done here — flagged as a follow-up architectural cleanup (the RBAC v6 golden-matrix packet for `eos.rocks.own.manage` should account for this when it's drafted, rather than modeling a clean single write path that doesn't currently exist).

## Verification

- Confirmed live via `pg_get_functiondef` re-fetch after the migration: the gate is present as the first statement in the function body.
- `is_vivacity_team_safe(p_user_id)` reused unchanged (checks `users.is_vivacity_internal = true AND NOT archived AND NOT disabled`) — same boundary as the EOS route guard, no new semantics introduced.
- No frontend change required; no existing legitimate caller's behavior changes (verified by re-reading `RockFormDialog.tsx` — it only ever passes payloads with `tenant_id: VIVACITY_TENANT_ID`, from a route already gated to Vivacity internal staff).
- Did not attempt to reproduce the exploit live against production (would require an unauthorized write against real EOS data); the SQL-level evidence (`SECURITY DEFINER` + `relforcerowsecurity=false` + no internal check + `EXECUTE` granted to `authenticated`) is conclusive on its own.

## Open questions parked

- Whether other `SECURITY DEFINER` RPCs across the codebase have the same missing-internal-check pattern combined with a table owned by `postgres` without `FORCE ROW LEVEL SECURITY` — this session only checked `upsert_rock_with_parenting` (found while tracing `eos.rocks.own.manage`) and did not do a broader sweep. Worth a dedicated audit pass.
- Whether `FORCE ROW LEVEL SECURITY` should be enabled on `eos_rocks` (and potentially other tables) as defense-in-depth, so a future `SECURITY DEFINER` function added without an internal check fails closed by default rather than silently bypassing RLS. Not done here — a broader schema-hardening decision, not a one-function hotfix.
- Consolidating `eos_rocks`' three write surfaces and removing the two dead-code branches (`archiveRock`, `deleteRock`, `useEosRocksHierarchy`'s unused `updateRock`) — parked as a Codebase Optimization / RBAC v6 follow-up.
- The RBAC v6 golden-matrix packet for `eos.rocks.own.manage` itself (the original task) — not drafted yet; this fix was a prerequisite finding surfaced while investigating it.
