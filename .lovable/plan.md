## Plan — Fix `start_client_package` billing fields

### Problem
The live `public.start_client_package` inserts into `package_instances` without setting `billing_type` or `billing_category`. New billable membership packages land with `billing_category = NULL`, so the certificate generator returns `NO_MEMBERSHIP`. 21 affected rows exist today.

### Change
Single new migration: `CREATE OR REPLACE FUNCTION public.start_client_package(...)` that mirrors the **current live definition** (bigint args, `fn_package_stream`, duplicate-type guard, legacy documents path, existing audit log) and adds:

1. Extend the `SELECT ... FROM packages` to also return `slug` into a new local `v_pkg_slug text`.
2. Declare `v_billing_type text` and `v_billing_category text`.
3. Derive both with this CASE (matches the Feb 2026 backfill verbatim, including the `-bc` CRICOS suffix the canonical backfill uses):

```sql
IF v_pkg_name LIKE 'KS%' OR v_pkg_name LIKE 'KickStart%' OR v_pkg_slug LIKE '%ks%' THEN
  v_billing_type := 'non_billable'; v_billing_category := NULL;
ELSIF v_pkg_name LIKE 'M-GTO%' THEN
  v_billing_type := 'billable';     v_billing_category := 'other';
ELSIF v_pkg_name LIKE 'M-%' AND (
  v_pkg_slug LIKE '%-rc' OR v_pkg_slug LIKE '%-gc'
  OR v_pkg_slug LIKE '%-dc' OR v_pkg_slug LIKE '%-sac'
  OR v_pkg_slug LIKE '%-bc'
) THEN
  v_billing_type := 'billable';     v_billing_category := 'membership_cricos';
ELSIF v_pkg_name LIKE 'M-%' THEN
  v_billing_type := 'billable';     v_billing_category := 'membership_rto';
ELSE
  v_billing_type := 'billable';     v_billing_category := 'other';
END IF;
```

4. Add `billing_type` and `billing_category` to the `INSERT INTO package_instances` column + values lists.
5. Add `'billing_type'` and `'billing_category'` to the audit log's `jsonb_build_object` payload so the start event captures the derived classification (audit completeness, no schema change).

### Out of scope (unchanged)
Stage instance loop, staff/client/email/document seeding, duplicate-type guard, `fn_package_stream` logic, audit log table, RLS, validation trigger, any other migration or function.

### Backward compatibility & risk
- Function signature unchanged — every caller (`useStartClientPackage`, edge functions, admin tools) continues to work without code changes.
- Derived values pass the existing `BEFORE INSERT` validation trigger (only valid enum strings used; KickStart correctly pairs `non_billable` + NULL category).
- `-bc` CRICOS suffix is preserved from the canonical backfill (user's snippet omitted it; including it prevents a future regression for CRICOS Business packages).
- No data migration: the 21 historical NULL rows are out of scope; the user already has the Feb backfill migration available to re-run if they want to clean them retroactively.
- No impact on capacity rollups, entitlements, certificate generator, membership state transitions, add-on linking, or RLS — all key off these fields and now receive correct values from row creation.

### Verification
After migration runs:
1. `SELECT pg_get_functiondef('public.start_client_package'::regproc)` shows the new CASE and INSERT columns.
2. Start a test M- package → new `package_instances` row has `billing_category = 'membership_rto'` (or `'membership_cricos'` for `-rc/-gc/-dc/-sac/-bc` slugs).
3. Start a test KS package → `billing_type = 'non_billable'`, `billing_category = NULL`.
4. Membership certificate download succeeds without manual backfill.

### Summary
- **Change**: one new migration replacing `start_client_package` to derive and persist `billing_type` + `billing_category` at insert time.
- **Benefit**: eliminates `NO_MEMBERSHIP` certificate failures for all future packages; keeps audit log self-describing.
- **Risk**: very low — additive column writes through an already-validated trigger, signature preserved, no behavioural change for any other workflow.
