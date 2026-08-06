# Audit: 2026-06-11 — v-client-tenant-users-display-name-fix

**Trigger:** ad-hoc — client portal (CSC side) showed "Hilton Redrup" for a user
whose `first_name`/`last_name` had been updated to "Hilton Farquhar".
**Scope:** `v_client_tenant_users` view (`display_name` expression only). No trigger,
RLS, FK, grant, or application code changes. `full_name` ("Full Legal Name") field
left fully intact as a manually-maintained field.

## Findings

- `v_client_tenant_users.display_name` COALESCE used `u.full_name` as its first
  fallback. `full_name` is the editable "Full Legal Name" field (can include middle
  names; set via `ProfileForm`). It is NOT automatically kept in sync when an admin
  updates `first_name`/`last_name` through the user management path.
- The `sync_user_full_name` trigger only populates `full_name` when it is NULL or
  empty — it does not overwrite a populated value on name changes. This is correct
  behaviour for a legal name field but creates a stale-display bug at the view layer.
- The admin users list reads `first_name`/`last_name` directly (correct); the client
  portal reads `display_name` from the view (stale). Hence the mismatch.
- Live DB sweep: 4 users had `full_name != first_name + last_name` — 3 were
  intentional middle names (Vivacity staff), 1 was the stale surname (Hilton).
  Hilton's `full_name` was already corrected in the DB before the migration ran
  (manual fix). The migration includes an idempotent UPDATE for audit-trail completeness.
- No other view or RPC in `public` used `full_name` for display. Bug was isolated
  to this view.
- Only one application consumer: `use-client-tenant-users.ts`. Column shape unchanged;
  no app code, `types.ts`, RLS, or FK changes required.

## KB changes shipped

- No KB changes this session.

## Codebase observations

- unicorn @ `af723f95` (origin/HEAD post-migration): migration
  `20260611004758_252e2f9f-8656-40aa-a90d-9d28c6b9b4a7.sql` applied —
  `v_client_tenant_users` recreated with `WITH (security_invoker = true)`;
  `display_name` COALESCE rewritten to use `first_name || ' ' || last_name` only;
  `full_name` removed from display path. `GRANT SELECT TO authenticated` and
  `COMMENT ON VIEW` preserved. Idempotent `UPDATE` for Hilton's row included.
- Post-deploy verification passed: `security_invoker=true` confirmed via `pg_class`;
  sample rows show `display_name` matches `first_name + last_name` with no
  middle-name leakage.

## Decisions

- `full_name` stays as a manually-maintained "Full Legal Name" field, fully
  decoupled from display. No trigger changes — intended behaviour is preserved.
- No data migration needed (Hilton's row already corrected); idempotent UPDATE
  included in migration for audit trail only.
- Optional trigger hardening (sync `full_name` on `first_name`/`last_name` changes)
  deferred — out of scope for this fix.

## Open questions parked

- If an admin ever changes `first_name`/`last_name` without updating `full_name`,
  the display will now always be correct (view fixed), but `full_name` will still
  hold a stale legal name. Consider adding UI guidance or a trigger that clears
  `full_name` when `last_name` changes — tracked as future hardening.
- `GovernanceDeliveryHistory.tsx` reads `full_name` directly from `public.users`
  (not via the view). If a staff user's `full_name` is stale, it would show the
  wrong name there too. Low risk (staff-only feature, Vivacity internal), but worth
  noting.

## Tag
audit-2026-06-11-v-client-tenant-users-display-name-fix
