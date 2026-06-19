# Staff Onboarding & Offboarding — DB Migration

Single migration adding three internal admin tables with RLS gated to Vivacity `Super Admin` / `Integrator` roles. No UI, no tenant data.

## Tables

### `public.staff_engagements`
- `id` uuid PK default `gen_random_uuid()`
- `person_name` text not null
- `person_email` text not null
- `role` text not null
- `engagement_type` text not null, CHECK in (`contractor`,`employee`)
- `type` text not null, CHECK in (`onboarding`,`offboarding`)
- `start_date` date not null
- `status` text not null default `in_progress`, CHECK in (`in_progress`,`pending_signoff`,`completed`,`cancelled`)
- `linked_unicorn_user_id` uuid null
- `created_by` uuid not null
- `created_at` timestamptz not null default `now()`

### `public.checklist_item_completions`
- `id` uuid PK default `gen_random_uuid()`
- `engagement_id` uuid not null → `staff_engagements(id)` ON DELETE CASCADE
- `item_key` text not null
- `completed_by` uuid not null
- `completed_at` timestamptz not null default `now()`
- UNIQUE (`engagement_id`, `item_key`)

### `public.engagement_signoffs`
- `id` uuid PK default `gen_random_uuid()`
- `engagement_id` uuid not null → `staff_engagements(id)` ON DELETE CASCADE
- `signoff_role` text not null, CHECK in (`staff_member`,`operations_manager`,`ceo`)
- `signed_by` uuid not null
- `signed_at` timestamptz not null default `now()`
- UNIQUE (`engagement_id`, `signoff_role`)

## Security

Helper SECURITY DEFINER function `public.is_vivacity_admin_role()` (search_path=''): returns true if `auth.uid()` maps to a `public.users` row (`user_uuid = auth.uid()`) whose `unicorn_role` is `Super Admin` or `Integrator`. Avoids referencing `users` directly in policies (prevents recursion / privilege leaks).

For each of the three tables:
1. `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated;` plus `GRANT ALL ... TO service_role;` (no `anon`).
2. `ENABLE ROW LEVEL SECURITY`.
3. Single `FOR ALL` policy `TO authenticated` USING + WITH CHECK `public.is_vivacity_admin_role()`.

## Notes
- No `updated_at` columns requested → none added; no update trigger.
- No FK to `auth.users` (per project rules); `created_by`, `completed_by`, `signed_by`, `linked_unicorn_user_id` stored as plain uuid referencing `users.user_uuid` by convention.
- Indexes on `engagement_id` for both child tables (implicit via UNIQUE, plus explicit btree on `staff_engagements(status)` for list filtering).
- No enum types (per project rules) — CHECK constraints used as specified.
