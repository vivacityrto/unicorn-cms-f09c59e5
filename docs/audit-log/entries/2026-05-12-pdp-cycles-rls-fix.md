# Audit: 2026-05-12 — pdp-cycles-rls-fix

**Trigger:** drift-surfaced — found during systematic cross-check of PDP
module implementation against `handoffs/pdp-lovable-prompts.md` (12 May 2026)  
**Scope:** `public.pdp_cycles` RLS policies only. No other tables, functions,
or migrations reviewed in this session. Codebase read-only except for the
single migration applied via Lovable.  
**Session owner:** Angela Connell-Richards  
**Lead dev:** Carl  
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev (ap-southeast-2)

---

## Findings

- `pdp_cycles` had no INSERT policy for authenticated non-staff users.
  `createCycle()` in `src/features/pdp/api.ts` executes via the browser
  supabase client and was blocked by RLS for all real users. The
  `pdp-auto-evidence` Edge Function was unaffected (uses service role).
- `pdp_cycles: users update own while open` had
  `WITH CHECK (user_id = auth.uid() AND status IN ('planning','active'))`.
  Closing a cycle (status → `'completed'`) failed the WITH CHECK silently
  for all non-Vivacity users. The "Close cycle" button was non-functional.
- Lovable's audit surfaced three additional hardening improvements over
  the originally proposed fix: (a) `under_review` missing from UPDATE
  USING — any cycle in `under_review` was uneditable by the user;
  (b) bare INSERT `WITH CHECK (user_id = auth.uid())` would permit status
  spoofing (insert at `completed`) and cross-tenant attribution; (c) no
  `completed_by` guard on the UPDATE WITH CHECK.
- No audit trigger on `pdp_cycles`. All other PDP tables also lack audit
  triggers. The project's audit-by-default rule is not satisfied for the
  PDP module. Flagged but deferred.
- Schema drift: five core PDP migrations (`pdp_audiences_reference`,
  `pdp_core_tables`, `pdp_indexes_and_triggers`, `pdp_rls_policies`,
  `pdp_views_summary_and_currency`) are live in `yxkgdalkbrriasiyyrwk`
  but absent from `supabase/migrations/` in the codebase repo. The schema
  was applied directly to Supabase on 11 May 2026 (see session change log
  authored by Angela Connell-Richards). Risk: the schema cannot be
  reproduced from the repo alone.
- Cross-reference: `audit/2026-05-11-pdp-views-security-invoker-fix.md`
  (Khian, 11 May 2026) previously noted a manager SELECT policy gap on
  `pdp_evidence_items`, `pdp_goals`, and `pdp_reflections` — managers can
  see `pdp_cycles` assigned to them but receive zero evidence/goal data in
  summary views. That gap is unrelated to this session's scope and remains
  open pending Angela's decision on a manager-facing PDP dashboard.

## DB change shipped

Migration `tighten_pdp_cycles_rls` applied to `yxkgdalkbrriasiyyrwk`
on 12 May 2026 via Lovable. Single transaction; no data changes.

**New INSERT policy — `pdp_cycles: users insert own`:**
```sql
CREATE POLICY "pdp_cycles: users insert own"
  ON public.pdp_cycles
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status IN ('planning', 'active')
    AND (
      tenant_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.tenant_users tu
        WHERE tu.user_id = auth.uid()
          AND tu.tenant_id = pdp_cycles.tenant_id
      )
    )
  );
```

**Replaced UPDATE policy — `pdp_cycles: users update own while open`:**
```sql
-- Dropped old policy with WITH CHECK (status IN ('planning','active'))
DROP POLICY "pdp_cycles: users update own while open" ON public.pdp_cycles;

CREATE POLICY "pdp_cycles: users update own while open"
  ON public.pdp_cycles
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND status IN ('planning', 'active', 'under_review')
  )
  WITH CHECK (
    user_id = auth.uid()
    AND status IN ('planning', 'active', 'under_review', 'completed')
    AND (completed_by IS NULL OR completed_by = auth.uid())
  );
```

Policy count on `pdp_cycles`: 5 → 6. Vivacity staff ALL policy unchanged.
Both views retain `security_invoker = true`. No code or type changes required.

**Rollback:** drop the new INSERT policy; drop and recreate the UPDATE
policy with its original `WITH CHECK (user_id = auth.uid() AND status IN
('planning','active'))`. Single migration, no data impact.

**Post-deploy verification (all passed):**
- 6 policies on `pdp_cycles` confirmed ✅
- Old restrictive UPDATE WITH CHECK absent ✅
- `relrowsecurity = true` ✅
- Both views retain `security_invoker = true` ✅
- INSERT denial test (status=`completed`): policy expression evaluates
  false ✅
- INSERT denial test (foreign `tenant_id`): EXISTS returns false ✅

## KB changes shipped

- `unicorn-kb @ b00bfc9` (branch `kb/pdp-follow-up-prompts`, PR #30 open):
  `handoffs/pdp-follow-up-prompts.md` created with follow-up Lovable
  prompts F-RLS through F16; `codebase-state/module-status.md` updated to
  reflect actual PDP shipped state (was stale at "UI not started").

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5 @ 5dbf39c4`: post-migration HEAD. PDP feature
  code (`src/features/pdp/`, pages, components) confirmed present for
  original Prompts 1–10 and 12. Four gaps remain and are covered by
  follow-up prompts F13–F16 in the KB (PR #30).

## Decisions

- Hardened INSERT `WITH CHECK` beyond original proposal: added status
  whitelist `('planning','active')` and `tenant_users` membership guard.
  Accepted.
- Hardened UPDATE `WITH CHECK` beyond original proposal: status whitelist
  excludes `archived`, `completed_by IS NULL OR completed_by = auth.uid()`
  guard added. Accepted.
- Added `under_review` to UPDATE `USING` clause so users can edit or close
  a cycle that is under manager review. Accepted.
- Audit trigger on `pdp_cycles`: deferred to a separate follow-up task.

## Open questions parked

- **Audit triggers on all PDP tables** — none of the six PDP tables have
  audit triggers. The project's audit-by-default convention is unmet.
  Recommend a follow-up migration adding INSERT/UPDATE logging to
  `audit_log` or `audit_events` for all six tables.
- **Schema drift** — five core PDP migrations are live in Supabase but
  absent from `supabase/migrations/`. Run `supabase db pull` before the
  next DB-touching Lovable session.
- **`manager_id` on INSERT** — a user can set `manager_id` to any UUID on
  cycle creation; that UUID gains SELECT via the existing manager policy.
  Low risk (own row only); accepted and documented.
- **Manager SELECT gap on child tables** — pre-existing open question from
  `audit/2026-05-11-pdp-views-security-invoker-fix.md`. Out of scope here.

## Tag

`audit-2026-05-12-pdp-cycles-rls-fix`
