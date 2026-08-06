# Audit: 2026-05-19 — Phase 5B (`eos_function_type` + `eos_seat_role_type` → `dd_` tables)

**Trigger:** Lovable production DB change session — Phase 5B of the enum-to-`dd_` migration stream. Grouped per Decision #6 scoped exception: same accountability chart feature, identical 0-function coupling profile.
**Author:** Khian (Brian)
**Scope:** `eos_function_type` → `dd_eos_function_type`; `eos_seat_role_type` → `dd_eos_seat_role_type`; `accountability_functions.function_type` and `accountability_seats.eos_role_type` columns converted; `seat_linked_data` view DROP + RECREATE. Out of scope: all other Phase 5 enums; `'closed'::meeting_status` cast in `seat_linked_data` (Phase 5F).
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev

---

## Findings

### DB changes delivered
Migration applied via Lovable (commit `ad4f2636` — "Applied migration to repo").

**`dd_eos_function_type` created and seeded (6 rows):**

| value | label | sort_order |
|---|---|---|
| `leadership` | Leadership | 1 |
| `operations` | Operations | 2 |
| `finance` | Finance | 3 |
| `delivery` | Delivery | 4 |
| `support` | Support | 5 |
| `sales_marketing` | Sales & Marketing | 6 |

**`dd_eos_seat_role_type` created and seeded (4 rows):**

| value | label | sort_order |
|---|---|---|
| `visionary` | Visionary | 1 |
| `integrator` | Integrator | 2 |
| `leadership_team` | Leadership Team | 3 |
| `functional_lead` | Functional Lead | 4 |

Both tables: standard `dd_accounting_system` shape. RLS enabled. Public SELECT policy (`FOR SELECT USING (true)`) applied.

**Column changes:**
- `accountability_functions.function_type`: `public.eos_function_type` → `text NULL`. FK `accountability_functions_function_type_fkey` → `dd_eos_function_type(value)` ON UPDATE CASCADE ON DELETE RESTRICT. All 7 rows were NULL pre-migration — no data at risk.
- `accountability_seats.eos_role_type`: `public.eos_seat_role_type` → `text NULL`. FK `accountability_seats_eos_role_type_fkey` → `dd_eos_seat_role_type(value)` ON UPDATE CASCADE ON DELETE RESTRICT. 7 rows migrated cleanly: `functional_lead`×5, `integrator`×1, `visionary`×1.

**`seat_linked_data` view DROP + RECREATE:**
Phase 1 inventory noted this view "survives column type change without DROP/RECREATE" — disproved during discovery. The `pg_depend` check confirmed the view's `eos_role_type` output column was registered as a normal dependency on the `eos_seat_role_type` enum type. DROP before `ALTER COLUMN TYPE` was required to avoid a dependency error. View recreated with byte-identical definition. `'closed'::meeting_status` cast in the subquery preserved — it is Phase 5F scope.

**Legacy enums retained:**
`public.eos_function_type` and `public.eos_seat_role_type` retained in `public` schema with `COMMENT ON TYPE` retention notices (Phase 5Z cleanup). Not archived in this migration.

**All 7 post-deploy checks passed:**

| # | Check | Result |
|---|---|---|
| 1 | `dd_eos_function_type` row count = 6 | pass |
| 2 | `dd_eos_seat_role_type` row count = 4 | pass |
| 3 | Both columns `data_type = text` | pass |
| 4 | No invalid `eos_role_type` values (0 rows) | pass |
| 5 | Row counts unchanged (7 / 7) | pass |
| 6 | Both FK constraints present (`contype = f`) | pass |
| 7 | `seat_linked_data` queryable (returns 7 rows) | pass |
| (bonus) | Both legacy enums still in `public` schema | pass |

### Coupling profile — lowest in Phase 5
- 0 SQL functions.
- 0 RLS policies.
- 0 triggers.
- 1 view (`seat_linked_data`) — handled by DROP + RECREATE.
- 28 component files and 2 hooks reference values via plain string comparisons — all byte-identical, no code changes needed.
- `src/types/accountabilityChart.ts` defines local union types `EosSeatRoleType` and `EosFunctionType` — independent of generated DB enum types, unaffected by migration.

### TypeScript widening
After types regeneration: `accountability_functions.function_type` and `accountability_seats.eos_role_type` widen from specific enum unions to `string | null` in generated Row types. `seat_linked_data.eos_role_type` similarly widens. Both enum unions (`eos_function_type`, `eos_seat_role_type`) remain in `Database["public"]["Enums"]` (legacy enums still present in `public` schema). Lovable applied an explicit `as EosSeatRoleType` cast in `SeatDetailPanel.tsx` where the widened type was assigned to `EosSeatRoleType`-typed state.

### Bug surfaced during audit
**BUG-033** — `src/test/fixtures/eos-test-data.ts:263` uses `function_type: "integrator"`, which is not a valid `eos_function_type` value. `integrator` belongs to `eos_seat_role_type`. With the FK now in place on `accountability_functions.function_type`, any test that inserts this fixture row into a DB will fail with a FK violation. Production is unaffected (`accountability_functions.function_type` was all NULL). Logged in `TobeFixedBugs.md` for fix after Phase 5B stabilises.

---

## KB changes shipped

- `EnumToDdInventory.md` updated at workspace root:
  - `eos_function_type` Enum Inventory row updated to `implemented — 19 May 2026`.
  - `eos_seat_role_type` Enum Inventory row updated to `implemented — 19 May 2026` with `seat_linked_data` DROP/RECREATE noted.
  - Phase 5B row in Phase Target Summary updated from `not started` to `implemented — 19 May 2026`.
  - Phase 5 Suggested Migration Phases row updated to note Phase 5B complete.
- `TobeFixedBugs.md` updated at workspace root: BUG-033 logged.

## Codebase observations

- Codebase at completion: origin HEAD `ad4f2636` — "Applied migration to repo" (Lovable, 19 May 2026).
- TypeScript types regenerated by Lovable in same commit.
- Local HEAD `b0d78ac5` — 2 commits behind origin at session end; flagged to user for pull.

## Decisions

- `seat_linked_data` DROP + RECREATE confirmed necessary — `pg_depend` link on enum type blocks ALTER COLUMN TYPE without it. Inventory note updated to reflect this. This pattern should be assumed for any future view with a pg_depend on an enum type column, regardless of whether the view uses an explicit cast.
- All 6 `eos_function_type` and all 4 `eos_seat_role_type` values seeded byte-identical, including values with zero DB rows (`leadership_team` for seats; all 6 for functions — column was 100% NULL). Consistent with Decision from Phase 5A: seed all values after codebase grep confirms frontend references.

## Open questions parked

- BUG-033: fix `eos-test-data.ts:263` (`function_type: "integrator"` → valid value like `"operations"`) and update `accountability.test.tsx:56` assertion. Deferred post-Phase 5B stabilisation.
- Phase 5Z cleanup: both `eos_function_type` and `eos_seat_role_type` enums pending archive once all Phase 5 sub-phases complete.
- Next in Phase 5: Phase 5C (`eos_issue_status`) — higher complexity (composite PK on `eos_issue_status_transitions`, 2 SQL functions, 8 values with active transition semantics).

## Tag

audit-2026-05-19-enum-phase-5b
