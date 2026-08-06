# Audit: 2026-05-13 — P1-a EOS SELECT policy deduplication

**Trigger:** P1-a from the 12 May 2026 deployment status audit — 20 EOS tables carrying multiple permissive SELECT policies, accumulated across development sessions. No consolidation had been performed.
**Author:** Carl
**Scope:** SELECT policies on 20 `eos_*` tables in `public` schema. Non-SELECT policies (INSERT, UPDATE, DELETE) on all tables left untouched.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev (ap-southeast-2)

---

## Background

Postgres ORs permissive SELECT policies together — a row is returned if any one policy passes. As the EOS module was built out across multiple sessions, new SELECT policies were added without removing prior ones. The result was redundant policy sets that increased maintenance debt (missing one policy when changing access rules), gave a false impression of intentional separation, and added unnecessary qual evaluation per query.

The audit was conducted via live MCP queries against `pg_policies` before any changes. All USING expressions were read and categorised before implementation began.

---

## Verdict

**Closed — all three phases applied and verified.**

| Phase | Tables | Old policies dropped | New policies created |
|-------|--------|---------------------|---------------------|
| 1 | 4 (`eos_qc_answers`, `eos_qc_fit`, `eos_qc_links`, `eos_qc_signoffs`) | 4 | 0 |
| 2 | 9 (`eos_accountability_chart`, `eos_agenda_templates`, `eos_scorecard_entries`, `eos_scorecard_metrics`, `eos_todos`, `eos_meeting_series`, `eos_alerts`, `eos_health_snapshots`, `eos_user_roles`) | 20 | 9 |
| 3 | 7 (`eos_qc`, `eos_vto`, `eos_meeting_segments`, `eos_meeting_summaries`, `eos_issues`, `eos_rocks`, `eos_headlines`) | 22 | 10 |
| **Total** | **20** | **46** | **19** |

Net: 20 tables, 46 old SELECT policies removed, 19 consolidated policies in place.

---

## Findings

### Policy taxonomy (pre-consolidation)

Five distinct redundancy patterns were identified:

**Group A — Pure redundant merges (eos_accountability_chart, eos_agenda_templates, eos_scorecard_entries, eos_scorecard_metrics, eos_todos, eos_meeting_series, eos_alerts, eos_health_snapshots, eos_user_roles):** Two or three policies with overlapping or subsumed USING expressions. Consolidated into one policy preserving the union of all access paths.

**Group B — Old API superseded (eos_qc_answers, eos_qc_fit, eos_qc_links, eos_qc_signoffs):** Each had an old manual subquery pattern (`qc_id IN (SELECT id FROM eos_qc WHERE ...)`) and a newer `can_access_qc(auth.uid(), qc_id)` SECURITY DEFINER function. `can_access_qc()` confirmed equivalent to or broader than the old pattern. Old `*_participant_select` policies dropped; `can_access_qc`-based policies retained unchanged.

**Group C — Meeting-scoped (eos_meeting_segments, eos_meeting_summaries):** One policy used `has_any_eos_role` via meeting JOIN; the other used `is_meeting_participant()`. Merged into one policy with both branches. `eos_meeting_summaries` client_viewer path merged into the single policy (meeting JOIN + `has_eos_role` check).

**Group D — Client-viewer distinct (eos_issues, eos_rocks, eos_headlines):** Each had a `client_viewers_select_*` policy using `client_id` JOIN (not `tenant_id`) to grant access to external client_viewer role users. These serve a genuinely different user type and cannot be merged with tenant-scoped policies. Resolved as two policies per table: one for client_viewer path, one consolidated staff/tenant/EOS path.

**Group E — Scope-keyed (eos_qc):** Three policies: a broad `eos_qc_select` (no scope filter) + `qc_select_tenant` (scope='tenant') + `qc_select_vivacity` (scope='vivacity'). The scoped policies added `is_eos_admin()` as an access path absent from the broad policy. All three merged into one policy that preserves unrestricted access for QC admins/participants and adds the `is_eos_admin` path for tenant-scoped records.

### Access change: eos_issues deleted_at

`eos_issues` had `deleted_at IS NULL` in only one of its four SELECT policies (`eos_issues_select`). The other three — vivacity, EOS users, and client_viewers — had no soft-delete filter, meaning those user types could see soft-deleted issues. Confirmed inconsistency, not intentional design. The consolidated `eos_issues_select` and `eos_issues_client_viewer_select` both apply `deleted_at IS NULL`. This narrows vivacity/EOS access to exclude soft-deleted issues — the correct behaviour.

### (SELECT auth.uid()) subquery form applied throughout

All new policies use `(SELECT auth.uid())` rather than bare `auth.uid()`. This prevents per-row re-evaluation of the auth call and is consistent with the P1-b hardening direction.

---

## DB changes shipped

### Phase 1 — Migration `<timestamp>_eos_qc_satellite_policy_dedup.sql`
- `DROP POLICY IF EXISTS "eos_qc_answers_participant_select"` on `eos_qc_answers`
- `DROP POLICY IF EXISTS "eos_qc_fit_participant_select"` on `eos_qc_fit`
- `DROP POLICY IF EXISTS "eos_qc_links_participant_select"` on `eos_qc_links`
- `DROP POLICY IF EXISTS "eos_qc_signoffs_participant_select"` on `eos_qc_signoffs`

**Verification:** 4 rows returned (one `*_select` per table using `can_access_qc()`); no `*_participant_select` rows. ✅

### Phase 2 — Migration `<timestamp>_eos_policy_dedup_phase2.sql`
20 old SELECT policies dropped across 9 tables; 9 consolidated policies created. Full policy inventory in migration file.

**Verification:** 9 tables × 1 SELECT policy each. ✅

### Phase 3 — Migration `<timestamp>_eos_policy_dedup_phase3.sql`
22 old SELECT policies dropped across 7 tables; 10 consolidated policies created.

**Verification:**

| Table | Count |
|-------|-------|
| `eos_headlines` | 2 |
| `eos_issues` | 2 |
| `eos_meeting_segments` | 1 |
| `eos_meeting_summaries` | 1 |
| `eos_qc` | 1 |
| `eos_rocks` | 2 |
| `eos_vto` | 1 |

✅

Pre-existing linter warnings on all three migrations confirmed unrelated to these changes.

---

## KB changes shipped

None. The `(SELECT auth.uid())` convention is already documented in `unicorn-kb/pinned/conventions.md`.

---

## Codebase observations (read-only)

- `eos_issues.deleted_at` column confirmed present via existing `eos_issues_select` policy USING expression.
- `can_access_qc(auth.uid(), qc_id)` — SECURITY DEFINER, STABLE, `SET search_path TO 'public'` — confirmed via `pg_get_functiondef` before Phase 1.
- `has_tenant_access_safe(bigint, uuid)` — used in `eos_rocks_client_viewer_select`; function existence confirmed by original policy using it.
- `has_eos_role(uuid, bigint, eos_role)` — used in client_viewer policies; confirmed in original `client_viewers_select_*` expressions.

---

## Decisions

- `can_access_qc()` confirmed as the canonical QC access check — old subquery pattern dropped.
- `deleted_at IS NULL` applied uniformly to all `eos_issues` SELECT paths — vivacity/EOS users previously had unintended access to soft-deleted issues.
- `eos_meeting_summaries` client_viewer path merged into a single policy (no separate policy needed — the OR branch is sufficient).
- `eos_issues`, `eos_rocks`, `eos_headlines` retain two SELECT policies each — client_viewer path uses `client_id` JOIN which cannot be merged with the tenant-scoped path without broadening or narrowing access.
- `eos_qc` broad admin access preserved without scope restriction — QC admins and direct participants see all QC records regardless of scope; `is_eos_admin` added for tenant-scoped records only.

---

## Open questions parked

- **P1-b follow-on:** Several helper functions called in these policies (`has_any_eos_role`, `is_meeting_participant`, `get_current_user_tenant`, `is_vivacity_team_user`) may themselves use bare `auth.uid()` internally rather than the subquery form. This is a separate body audit (related to P1-e-ii).
- **`eos_issues` soft-delete for vivacity staff:** If staff legitimately need to view soft-deleted issues for debugging, a separate admin query path should be built — not via RLS bypass.

---

## Tag

`audit-2026-05-13-p1a-eos-select-policy-dedup`
