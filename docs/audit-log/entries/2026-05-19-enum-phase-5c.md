# Audit: 2026-05-19 — Phase 5C (`eos_issue_status` → `dd_eos_issue_status`)

**Trigger:** Lovable production DB change session — Phase 5C of the enum-to-`dd_` migration stream.
**Author:** Khian (Brian)
**Scope:** `eos_issue_status` → `dd_eos_issue_status`; `eos_issues.status`, `eos_issue_status_transitions.from_status`, and `eos_issue_status_transitions.to_status` columns converted; composite PK on `eos_issue_status_transitions` dropped and recreated as text; 13 dependent views DROP + RECREATE; `set_issue_status` function casts removed; `eos_issue_status_options` view replaced; legacy enum archived to `archive` schema in same session. Out of scope: all other Phase 5 enums.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev

---

## Findings

### DB changes delivered

Three migration attempts were required. PostgreSQL surfaced additional dependent views on each attempt, expanding the drop/recreate list from 1 → 11 → 13 views.

**Attempt 1** — `20260519023839_b9b79844-6901-4394-905d-5e39127a01c7.sql`
Failed: `v_executive_client_health` and `v_executive_consultant_distribution` depended on `v_phase_actions_remaining` and `v_client_risk_summary` (which were in the drop list). PostgreSQL blocked execution.

**Attempt 2** — `20260519024151_c4bb1864-97fd-4b88-895f-3d5cadac1c31.sql`
Failed: `v_client_risks_actions` and `v_client_eos_summary` directly referenced `eos_issues.status` column and were not in the drop list. PostgreSQL blocked the column type change.

**Attempt 3 (final)** — `20260519030910_2a6fd031-f866-46ef-835c-6938e0396860.sql`
All 13 dependent views included in correct dependency order. Applied cleanly.

---

**`dd_eos_issue_status` created and seeded (8 rows):**

| value | label | sort_order |
|---|---|---|
| `Open` | Open | 1 |
| `Discussing` | Discussing | 2 |
| `Solved` | Solved | 3 |
| `Archived` | Archived | 4 |
| `In Review` | In Review | 5 |
| `Actioning` | Actioning | 6 |
| `Escalated` | Escalated | 7 |
| `Closed` | Closed | 8 |

Standard `dd_accounting_system` shape. RLS enabled. Public SELECT policy applied.

**Column changes:**
- `eos_issues.status`: `public.eos_issue_status` → `text NULL`. FK `fk_eos_issues_status` → `dd_eos_issue_status(value)` ON UPDATE CASCADE ON DELETE RESTRICT. 24 rows preserved: `Open`×6, `Solved`×15, `Discussing`×1, `Closed`×2. No nulls introduced.
- `eos_issue_status_transitions.from_status`: `public.eos_issue_status` → `text NOT NULL`. FK `fk_transitions_from_status` → `dd_eos_issue_status(value)`.
- `eos_issue_status_transitions.to_status`: `public.eos_issue_status` → `text NOT NULL`. FK `fk_transitions_to_status` → `dd_eos_issue_status(value)`.
- Composite PK `eos_issue_status_transitions_pkey (from_status, to_status)`: dropped before column type change, recreated as text. 19 transition rows preserved byte-identical.

**SQL function changes:**
- `set_issue_status(p_issue_id uuid, p_status text, ...)`: 5 `::eos_issue_status` casts removed. Function recreated with SECURITY DEFINER + `SET search_path TO 'public'` preserved. Parameter `p_status` was already `text` — no signature change.
- `handle_eos_issue_status_change` (trigger fn): uses plain string comparisons throughout (`NEW.status IN ('Solved', 'Closed')`, `NEW.status = 'Escalated'`) — no enum casts, not touched.

**13 views DROP + RECREATE (in dependency order):**
1. `v_executive_client_health`
2. `v_executive_consultant_distribution`
3. `v_client_risk_summary`
4. `v_score_risks`
5. `v_dashboard_consultant_momentum`
6. `v_phase_actions_remaining`
7. `v_momentum_state`
8. `v_completion_eligibility`
9. `v_progress_anchor_inputs`
10. `v_predictive_signal_inputs`
11. `v_client_risks_actions`
12. `v_client_eos_summary`
13. `eos_issue_status_options` — definition changed from `SELECT unnest(enum_range(NULL::eos_issue_status))::text AS value` to `SELECT value FROM dd_eos_issue_status ORDER BY sort_order`. This is the view consumed by `useEosStatusOptions()` hook — transparent to the frontend (same view name, same column name).

All 12 non-options views: definitions recreated byte-identical (no logic change). `v_client_eos_summary` already used `(ei.status)::text` casts in WHERE clauses — after migration those become no-op `text::text`, no logic change.

**Legacy enum archived (same session):**
`public.eos_issue_status` moved to `archive` schema via `ALTER TYPE public.eos_issue_status SET SCHEMA archive`. Zero non-implicit dependents confirmed before archiving (`pg_depend` returned empty). Retention `COMMENT ON TYPE` added: archived 19 May 2026, replaced by `dd_eos_issue_status`, rollback is `ALTER TYPE archive.eos_issue_status SET SCHEMA public`. Archive migration is one of the two unpulled migrations in the DB (`20260519040443` or `20260519041919`) — not yet in local codebase at session end.

**All 20 post-deploy checks passed:**

| # | Check | Result |
|---|---|---|
| 1 | `dd_eos_issue_status` seeded — 8 rows, all active | pass |
| 2 | `eos_issues` data preserved — `Closed`×2, `Discussing`×1, `Open`×6, `Solved`×15 | pass |
| 3 | No nulls introduced — `null_count = 0` | pass |
| 4 | Transition table intact — 19 rows | pass |
| 5 | Composite PK active (`eos_issue_status_transitions_pkey`) | pass |
| 6 | 3 FKs active to `dd_eos_issue_status` | pass |
| 7 | `eos_issue_status_options` returns 8 values in sort_order sequence | pass |
| 8 | Legacy enum in `archive` schema (not `public`) | pass |
| 9a–9l | All 12 recreated views queryable (row counts: `v_client_risk_summary` 95, `v_score_risks` 1, `v_dashboard_consultant_momentum` 87, `v_phase_actions_remaining` 95, `v_momentum_state` 95, `v_completion_eligibility` 96, `v_progress_anchor_inputs` 95, `v_predictive_signal_inputs` 97, `v_executive_client_health` 82, `v_executive_consultant_distribution` 9, `v_client_risks_actions` 24, `v_client_eos_summary` 407) | pass |

### Coupling profile
- 2 SQL functions: `set_issue_status` (5 casts removed), `handle_eos_issue_status_change` (untouched — plain strings).
- 1 trigger: `eos_issue_status_change` on `eos_issues` → fires `handle_eos_issue_status_change`. Not touched.
- 0 RLS policies.
- 13 views: all handled by DROP + RECREATE.
- Frontend: `useEosStatusOptions()` reads `eos_issue_status_options` by view name — transparent. `useEosStatusTransitions()` reads `eos_issue_status_transitions` — unaffected. All status comparisons in `EosRisksOpportunities.tsx`, `useClientImpact.tsx`, `useRisksOpportunities.tsx` are plain strings — unaffected.
- No edge function references to `eos_issue_status` (confirmed `supabase/functions/` search returned nothing).

### View dependency discovery — blast radius expansion
Phase 1 inventory noted only `v_client_risks_actions` as a view consumer. Live discovery found 13 views with direct or transitive dependency on the enum-typed columns. This is consistent with the Phase 5B pattern where `seat_linked_data` was also missed by the inventory. **Key lesson: `pg_depend` must be run at migration time, not relied on from pre-session inventory.**

### TypeScript widening
After types regeneration: `eos_issues.status` widens to `string | null`; `eos_issue_status_transitions.from_status` / `to_status` widen to `string`. `eos_issue_status` enum union absent from `Database["public"]["Enums"]` — legacy enum is in `archive` schema, not `public`, so it does not appear in generated types. No `as` casts required in application code (all comparisons already plain strings).

### Stale Lovable flag — `v_dashboard_labour_efficiency`
Lovable's implementation report flagged `v_dashboard_labour_efficiency` as containing `::unicorn_role` casts that would break when `unicorn_role` becomes text. Live DB query confirmed the view already uses `::text` casts — Phase 4D-2 had already fixed this. Lovable was reading a stale snapshot. No action required; view is 4D-2 scope and already compliant.

---

## KB changes shipped

- `EnumToDdInventory.md` updated at workspace root:
  - `eos_issue_status` Enum Inventory row updated to `implemented — archived 19 May 2026` with full conversion detail.
  - Phase 5C row in Phase Target Summary updated from `not started` to `implemented — archived 19 May 2026` with all post-deploy facts.
  - Phase 5 Suggested Migration Phases row updated to note Phase 5C implemented and archived in same session.

## Codebase observations

- Main Phase 5C migration in codebase: `20260519030910_2a6fd031-f866-46ef-835c-6938e0396860.sql`.
- Two prior failed attempts also present: `20260519023839_b9b79844-...` (Attempt 1) and `20260519024151_c4bb1864-...` (Attempt 2).
- Archive migration (ALTER TYPE ... SET SCHEMA archive): in DB as `20260519040443` or `20260519041919` — not yet in local codebase at session end (codebase not pulled).
- Local codebase HEAD not confirmed at session end — user to verify pull state.

## Decisions

- All 8 `eos_issue_status` values seeded byte-identical, including the 4 values with zero DB rows (`Archived`, `In Review`, `Actioning`, `Escalated`). Consistent with Phase 5A/5B decision: seed all values after codebase grep confirms frontend references.
- Legacy enum archived to `archive` schema in the same session as the migration, not deferred to Phase 5Z. Justified by: zero remaining `pg_depend` entries confirmed live before archiving. This is safe to do immediately when no columns remain typed as the enum.
- Composite PK `(from_status, to_status)` on `eos_issue_status_transitions` must be dropped before `ALTER COLUMN TYPE` and recreated after. This pattern should be assumed for any table with a composite PK containing enum-typed columns.

## Open questions parked

- Archive migration filename (`20260519040443` or `20260519041919`): confirm after user pulls codebase.
- Phase 5Z cleanup: `eos_issue_status` already archived — does not need to be included in Phase 5Z scope. Update Phase 5Z row in inventory when Phase 5D begins.
- Next in Phase 5: Phase 5D (`eos_participant_role`) — 4 SQL functions, 1 trigger, 162 rows.

## Tag

audit-2026-05-19-enum-phase-5c
