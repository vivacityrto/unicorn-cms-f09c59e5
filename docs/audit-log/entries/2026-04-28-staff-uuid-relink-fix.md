# Audit: 2026-04-28 — Staff UUID Relink Fix

**Trigger:** ad-hoc — production outage (staff dashboard infinite spinner)
**Scope:** Auth re-provisioning bug, FK constraint architecture on `users(user_uuid)`, invite flow `user_type` hypothesis, relink trigger correctness. Did not audit client-facing flows or non-`users` FK trees.

---

## Findings

- **Root cause:** Carl (carl@vivacity.com.au) and Brian (brian@vivacity.com.au) had `users.user_uuid` pointing to stale placeholder UUIDs from when their accounts were created via the `skip_email` invite path. Their real `auth.users.id` values differed, so `useAuth` found no profile → `isVivacityStaff = false` → permanent spinner. Same pattern previously hit Kelly Xu (fixed manually in migration `20260201231515`).

- **108 FK constraints** referencing `public.users(user_uuid)` were all `ON UPDATE NO ACTION`, none deferrable. The relink trigger's UPDATE was silently rolling back whenever the user had any child-table rows (which all Vivacity staff do).

- **`link_auth_user_to_profile` is the live relink trigger** (not `handle_new_user`, which is defined but unbound — dead code). It had a second independent bug: `WHERE (user_uuid IS NULL OR user_uuid = NEW.id)` prevented the relink in exactly the re-provision case.

- **`handle_new_user()` function is unbound** — exists in the DB but no trigger points to it. Dead code. Deferred for hygiene cleanup.

- **Duplicate trigger `update_tenant_status_trigger`** on `public.users` — pre-existing hygiene issue, deferred.

- **`'Vivacity Team'` enum hypothesis cleared** — both `'Vivacity'` and `'Vivacity Team'` exist in `user_type_enum`. The invite flow writes valid values. No enum mismatch in production.

- **Full sweep scope confirmed** — not just Carl and Brian; any `public.users` row whose `user_uuid` has no matching `auth.users.id` is a candidate. The `repair-staff-uuids` edge function handles this.

---

## KB changes shipped

- unicorn-kb @ _(see PR)_: new handoff `handoffs/lovable-production-db-change.md` — standardised workflow for implementing production database changes via Lovable with plan mode, phased prompts, and Dave-approved depth requirements.

---

## Codebase observations (read-only)

- unicorn-cms-f09c59e5 @ `cf8d1314` (local) / `e76355b0` (origin) at session start — local HEAD ahead of origin; user decided not to pull.
- Migrations shipped via Lovable this session (not hand-edited):
  - Migration A: `public.user_uuid_history` table + SuperAdmin RLS
  - Migration B: All 108 FKs on `users(user_uuid)` converted to `ON UPDATE CASCADE NOT VALID`
  - Migration C: `link_auth_user_to_profile()` rewritten — removed buggy WHERE clause, added collision detection, added history logging, errors never block auth insert
  - Migration D: `fk_validation_runs` audit table + `run_user_uuid_fk_validation()` function + pg_cron job scheduled for 22:30 AEST 28 April 2026 (jobid 7, self-unscheduling)
  - Edge function: `repair-staff-uuids` — SuperAdmin sweep tool with `?dry_run=true` support

---

## Decisions

- **Option A (cascade audit_log):** `audit_log.user_uuid` and `audit_log.editor_uuid` FK constraints are cascaded along with all 108 others. `user_uuid_history` table provides forensic recovery path if immutable-audit policy is required later.
- **Full sweep:** `repair-staff-uuids` targets all mismatched rows, not just named individuals.
- **Dead code deferred:** `handle_new_user()` and duplicate `update_tenant_status_trigger` left in place; hygiene migration deferred.
- **Audit prompting workflow standardised:** Dave-requested deep-dive, plan-mode, phased-prompt approach captured in KB handoff (see above).

---

## Open questions parked

- **Migration D results** — run the verification queries tomorrow morning: `SELECT status, count(*) FROM fk_validation_runs WHERE started_at > now() - interval '24 hours' GROUP BY status;` — expect 108 `success`, zero `error`.
- **`repair-staff-uuids` 401** — edge function requires a logged-in SuperAdmin JWT; service role key rejected. Needs a fix so Angela or another SuperAdmin can invoke it without the SQL editor.
- **Prompt 4 (invite flow end-to-end)** — not yet run. Confirm new Vivacity staff invite → sign-up → dashboard load works end-to-end with the hardened trigger.
- **Prompt 5 (final verification and summary)** — not yet run. Run after Migration D results confirmed.

---

## Tag

`audit-2026-04-28-staff-uuid-relink-fix`
