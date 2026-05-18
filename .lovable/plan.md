# Plan — Migration: `client_audits_tenant_read_active`

Add one additive SELECT policy to `public.client_audits` so tenant users can read their own tenant's active audits (`draft`, `in_progress`, `review`, `complete`). Existing policies untouched. No frontend changes.

## 1. Correction to Prompt 2's plan — confirmed

The earlier "staff-only guard on `/audits/:id`" mitigation is **not required**. `src/components/ProtectedRoute.tsx:52–56` enforces deny-by-default via the `CLIENT_ROUTES` allowlist: `/audits` is not in `CLIENT_ROUTES`, so any client user (`unicorn_role` `Admin` or `User`) hitting `/audits/:id` is redirected to `/dashboard` before `AuditWorkspaceNew` mounts and before `useAudit`'s `select('*')` ever runs. Verified by direct read of the file. No frontend change ships with this migration.

## 2. Migration file

**Path:** `supabase/migrations/<timestamp>_client_audits_tenant_read_active.sql` (timestamp assigned at apply time so it sorts after every existing migration).

**Contents (exact):**

```sql
-- Allow tenant members to read their own tenant's audits while the audit is
-- active. Released-report visibility remains governed by
-- client_audits_tenant_read_v2; staff full access remains via
-- client_audits_staff_all. Archived/cancelled audits are excluded.
-- Column protection on client paths is enforced by:
--   (a) explicit-column SELECTs in every client-reachable hook, and
--   (b) the ProtectedRoute CLIENT_ROUTES allowlist, which blocks clients from
--       reaching the staff workspace route that uses select('*').

CREATE POLICY client_audits_tenant_read_active
  ON public.client_audits
  FOR SELECT
  TO authenticated
  USING (
    app.user_can_access_tenant(subject_tenant_id)
    AND status IN ('draft', 'in_progress', 'review', 'complete')
  );

COMMENT ON POLICY client_audits_tenant_read_active
  ON public.client_audits IS
  'Tenant members can read active audits (draft/in_progress/review/complete) for their tenant. Archived and cancelled are excluded; released-report visibility is governed by client_audits_tenant_read_v2.';
```

No other DDL. No triggers, no FK changes, no column changes, no index changes, no view changes.

## 3. Out of scope (do NOT touch)

- `client_audits_tenant_read_v2`, `client_audits_staff_all`
- Any RLS policy on any other table (incl. `audit_appointments` — `audit_appts_client_read`'s EXISTS subquery automatically benefits from the new visibility)
- Any column / index / trigger / FK on `client_audits`
- Any frontend file (`ProtectedRoute`, `App.tsx` routes, all hooks)
- `audit_send_evidence_reminders` cron (known separate bug)

## 4. Pre-deploy verification SQL

```sql
-- Existing policies on client_audits (expect 2: staff_all, tenant_read_v2)
SELECT polname FROM pg_policy
WHERE polrelid = 'public.client_audits'::regclass
ORDER BY polname;

-- Baseline: in-progress audit count for tenant 7533 (Test RTO)
SELECT subject_tenant_id, status, COUNT(*)
FROM public.client_audits
WHERE subject_tenant_id = 7533
GROUP BY 1, 2 ORDER BY 2;

-- Hero view as staff (expected: audits_total = 1 for tenant 7533)
SELECT tenant_id, audits_total FROM public.v_client_home_hero
WHERE tenant_id = 7533;
```

## 5. Post-deploy verification SQL

```sql
-- New policy present, definition correct
SELECT polname, pg_get_expr(polqual, polrelid) AS qual
FROM pg_policy
WHERE polrelid = 'public.client_audits'::regclass
  AND polname = 'client_audits_tenant_read_active';

-- Sanity: 3 policies total now
SELECT polname FROM pg_policy
WHERE polrelid = 'public.client_audits'::regclass
ORDER BY polname;
```

Expected: `client_audits_staff_all`, `client_audits_tenant_read_active`, `client_audits_tenant_read_v2`.

## 6. Browser smoke test (gating)

The deploy is not "done" until all five steps pass:

1. Incognito window → log in as `diamondhood14@gmail.com` (TP — tenant 7533 Test RTO, `unicorn_role = 'Admin'`).
2. Navigate to `/client/home`.
3. Confirm:
   - **Audit Readiness** tile renders with non-empty data (documentation coverage + steps remaining).
   - **Upcoming Compliance Audit** section appears (the Mock Audit is `status = 'in_progress'`).
4. DevTools → Network → filter `client_audits`. Confirm every request URL contains an explicit `select=` column list — **no bare `*`**.
5. Manually navigate to `/audits/<mock-audit-uuid>`. Expect immediate redirect to `/dashboard` (existing `ProtectedRoute` deny-by-default). The workspace must **not** render.

## 7. Rollback

```sql
DROP POLICY IF EXISTS client_audits_tenant_read_active ON public.client_audits;
```

- Exact-prior behaviour restored (released reports only visible to clients).
- Zero data impact — RLS DDL only.
- Safe in standard hours; same transient lock characteristics as the forward migration.

## 8. Lock impact

`CREATE POLICY` takes a transient `AccessExclusiveLock` on `public.client_audits`, measured in milliseconds. No table rewrite, no index rebuild, no row scan. Standard-hours deploy approved.

## 9. Summary

**Change:** add one SELECT policy, `client_audits_tenant_read_active`, on `public.client_audits` permitting tenant members to read `draft`/`in_progress`/`review`/`complete` audits for tenants they belong to. One migration file, no frontend changes, no other DB changes.

**Benefits:**
- Client portal "Audit Readiness" tile and "Upcoming Compliance Audit" section render real, live data instead of empty state.
- `v_client_home_hero.audits_total` reflects live engagements for tenant users.
- `audit_appts_client_read` (EXISTS subquery) starts returning appointments for in-flight audits with no further policy change.
- Staff workflows and released-report visibility are byte-identical to today.

**Backward compatibility:** Additive policy only. OR semantics with existing policies guarantee no previously visible row becomes invisible. v2 and staff_all preserved verbatim. FKs, triggers, audit trail untouched.

**Risk assessment:**

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| Column leak via `useAudit` `select('*')` at `/audits/:id` | NONE | — | `ProtectedRoute` deny-by-default already redirects clients to `/dashboard` before the component mounts (verified at `src/components/ProtectedRoute.tsx:52–56`). |
| Cross-tenant leak | NONE | — | `app.user_can_access_tenant()` is the same predicate already used by `client_audits_tenant_read_v2`. |
| Archived / cancelled audits leak to clients | NONE | — | New policy explicitly restricts to `('draft','in_progress','review','complete')`. |
| `AuditProgressCard` showing partial `score_*` / `risk_rating` mid-audit | LOW | LOW (UX, not security) | Whitelisted columns already return `null` mid-audit until staff populate them; no leak. Optional follow-up: hide score chips when `status != 'complete'`. Out of scope here. |
| DDL lock contention | NEGLIGIBLE | — | Transient `AccessExclusiveLock`, ms-scale, no rewrite. |
| Rollback failure | NONE | — | Single `DROP POLICY` statement. |

**Production readiness:** Ready to deploy. No gating frontend work; standard-hours window approved; rollback is one statement.
