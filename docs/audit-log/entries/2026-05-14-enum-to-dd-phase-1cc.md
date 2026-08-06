# Audit: 2026-05-14 — enum-to-dd Phase 1C-C (`vivacity_role` archive)

**Trigger:** Lovable production DB change session — Phase 1C-C of the enum-to-`dd_` rollout.
**Author:** Khian (Brian)
**Scope:** Phase 1C-C only — archiving the orphaned `vivacity_role` enum. No `dd_` table created. Out of scope: all other enum families, Phase 2 (closed), Phase 3–5 (not started).
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev
**Codebase SHA:** `177be834` — "Moved role enum to archive table"

---

## Findings

### Phase 1C-C — `vivacity_role` (complete)

**Discovery summary:**

- `vivacity_role` enum has three values: `SUPER_ADMIN`, `TEAM_LEADER`, `TEAM_MEMBER`.
- No table column in the live DB uses this enum type. `information_schema.columns` returned zero results.
- No SQL function, RLS policy, trigger, view, or `pg_depend` dependent references this enum.
- Codebase search (all `.ts`, `.tsx`, `.sql` files in `unicorn-cms-f09c59e5/`) found zero application references. The only occurrences were two auto-generated lines in `src/integrations/supabase/types.ts` (type union + runtime constants array) — machine-generated output that self-corrects on next type regeneration.
- No migration file in the codebase repo defines or references `vivacity_role`. It was almost certainly created manually in the database before the current migration-file workflow was established.

**Root cause — why this enum existed:**

`vivacity_role` was an early design artefact created to classify internal Vivacity staff. In October 2025, `unicorn_role` was built properly via migration files with friendlier Title Case labels (`Super Admin`, `Team Leader`, `Team Member`) and attached to `users.unicorn_role` as the live role column. `vivacity_role` was never attached to any column at any point and was silently superseded. It was a ghost type.

**Decision — archive only, no `dd_` table:**

Creating `dd_vivacity_role` was evaluated and rejected. The concept the enum represented is already covered by `unicorn_role` (future Phase 4 target: `dd_unicorn_role`). A separate `dd_vivacity_role` table would duplicate that purpose with no operational benefit. Archive-only was approved as the correct disposal path.

**Migration applied:**

- Pre-flight checks confirmed: zero column dependents, enum present in `public`, `archive` schema present, no name collision in `archive`.
- Single statement: `ALTER TYPE public.vivacity_role SET SCHEMA archive;`
- No data movement, no column changes, no RLS changes.
- Rollback (if needed): `ALTER TYPE archive.vivacity_role SET SCHEMA public;`

**Post-deploy verification — all 3 checks passed:**

| Check | Expected | Result |
| --- | --- | --- |
| `vivacity_role` absent from `public` schema | 0 rows | ✅ 0 rows |
| `vivacity_role` present in `archive` schema | 1 row | ✅ 1 row |
| No column in `public` typed as `vivacity_role` | 0 rows | ✅ 0 rows |

**Inventory update:**

- `EnumToDdInventory.md` updated: Phase 1C-C status set to `implemented`. Phase 1 overall status updated to `done`. Main enum inventory row updated to `implemented — archived`.
- Phase 1 is now fully closed across all sub-phases (1A, 1B, 1A-C skipped, 1B-C, 1C-C).

---

## Phase 1 closure summary

With Phase 1C-C complete, Phase 1 (unused and low-risk enum cleanup) is fully closed as of 14 May 2026.

| Sub-phase | Enum | Outcome |
| --- | --- | --- |
| 1A | `feature_flag` | `dd_feature_flag` created and seeded. Legacy enum retained. |
| 1B | `meeting_type`, `rock_type`, `stage_state`, `task_status` | Four `dd_` tables created and seeded. Legacy enums retained. |
| 1A-C | `invite_status` | Skipped — stable values, no operational benefit from conversion. |
| 1B-C | `tenant_role` | `dd_tenant_role` created. Column dropped. Legacy enum archived. 7 RLS policies fixed as a side effect. |
| 1C-C | `vivacity_role` | Legacy ghost enum archived to `archive` schema. No `dd_` table created. |

---

## Codebase observations

- `src/integrations/supabase/types.ts` still lists `vivacity_role` in the generated enum definitions. This will self-correct on the next Supabase type regeneration — no manual edit required or appropriate.
- No other codebase files reference `vivacity_role` or its three values.

## KB changes shipped

- `EnumToDdInventory.md` updated in workspace root (not a `unicorn-kb/` file — lives in `unicorn-workspace/`). Changes: Phase 1C-C status → `implemented`; Phase 1 status → `done`; main enum inventory row updated.

## Open items

- None from this session.
- Phase 1A-C (`invite_status`) and Phase 1C-C (`vivacity_role`) are now both closed without conversion — both remain as legacy enum types in `archive` and `public` respectively pending a future decision on whether to drop entirely.
- Phase 2 already closed (13 May 2026). Next up: Phase 3 (notification enums) — requires separate session and scoping.
