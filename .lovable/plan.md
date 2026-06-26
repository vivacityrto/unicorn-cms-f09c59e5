# Plan — Seed M-DR-V2 Package (Additive)

## Goal
Create a brand-new v2 Diamond RTO membership package template with 8 stages, plus all staff_tasks and client_tasks described in the spec. No existing records are modified.

## Approach
Execute as a single `supabase--insert` call wrapping all inserts in one `DO $$ ... $$` PL/pgSQL block. This lets us capture auto-generated ids into local variables (`v_pkg_id`, `v_stage_a_id`, ... `v_stage_h_id`) and use them in dependent inserts without hardcoding numbers. The whole block runs as one transaction — if any insert fails, nothing is committed.

## Steps inside the block

1. **Insert package** into `packages` (M-DR-V2, membership, stage_completion, 91 hrs, 12 months, user_limit NULL). Capture `v_pkg_id`.
2. **Insert 8 stages** (A–H) into `stages` with the exact names, shortnames, stage_type, is_recurring, status='active', version_label='v2-2026', and descriptions from the spec. Capture each `v_stage_*_id`.
3. **Insert 8 rows into `package_stages`** linking `v_pkg_id` → each stage id, with `sort_order` 1–8, `is_required=true`, `is_recurring` mirroring the stage value, `update_policy='manual'`.
4. **Insert all staff_tasks** per stage with the exact `order_number`, `name`, `description`, `due_date_offset`, `is_recurring`, `is_core`, `is_key_event` values from the spec.
5. **Insert all client_tasks** per stage with the exact `sort_order`, `name`, `instructions`, `due_date_offset`, `is_mandatory` values from the spec.
6. **Verification query** at the end via `RAISE NOTICE`: count of package_stages for `v_pkg_id` (must equal 8), plus the new package id and all 8 stage ids.

## Safety Guards
- Pre-check: `IF EXISTS (SELECT 1 FROM packages WHERE name='M-DR-V2') THEN RAISE EXCEPTION ...` — abort cleanly if already seeded (idempotency without touching legacy rows).
- All inserts target NEW rows only — no UPDATE/DELETE anywhere.
- No reference to package ids 1027, 1028, 1033, 1035, 1041 or any stage id ≤ 1119.
- Uses RETURNING ... INTO to fetch generated ids — never hardcoded.
- Single transaction → atomic rollback if anything fails.

## Deliverable to user
After the insert tool runs, I'll report back:
- New `package_id`
- All 8 new `stage_id`s (labelled A–H)
- Confirmed `package_stages` count = 8
- Staff task and client task row counts per stage

## Technical notes
- `packages.id` bigint, `stages.id` integer, `package_stages.stage_id` bigint (integer auto-casts).
- `staff_tasks` columns used: `stage_id, order_number, name, description, due_date_offset, is_recurring, is_core, is_key_event`.
- `client_tasks` columns used: `stage_id, name, instructions, sort_order, due_date_offset, is_mandatory`.
- `package_stages` columns used: `package_id, stage_id, sort_order, is_required, is_recurring, update_policy`.
- Spec note mentions "ON CONFLICT DO NOTHING" but no natural unique key exists on these template tables; the pre-check on package name provides equivalent idempotency.

Approve to execute.