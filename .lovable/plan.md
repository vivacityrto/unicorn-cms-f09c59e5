# Fix `set_issue_status` null tenant_id bug

## Problem
When a Vivacity staff member changes an issue status in the IDS dialog, `set_issue_status` fails with `null value in column "tenant_id" of relation "audit_eos_events"`. Two root causes:

1. Meeting auto-link query: `WHERE m.tenant_id = v_issue.tenant_id` evaluates to false when `v_issue.tenant_id` is NULL, so no active meeting is found and `meeting_id` is never backfilled.
2. Audit insert uses `v_issue.tenant_id` directly; when null, the NOT NULL constraint rolls back the entire transaction.

## Fix
Replace `public.set_issue_status` via migration. Signature, return type, and all other logic unchanged.

Changes inside the function body:

- Add `v_resolved_tenant_id bigint;` to DECLARE.
- Meeting auto-link WHERE clause becomes:
  `WHERE (v_issue.tenant_id IS NULL OR m.tenant_id = v_issue.tenant_id)`
- After the meeting-link block, resolve tenant:
  ```sql
  v_resolved_tenant_id := COALESCE(
    v_issue.tenant_id,
    (SELECT tenant_id FROM public.eos_meetings WHERE id = v_issue.meeting_id)
  );
  ```
- Guard the audit INSERT:
  ```sql
  IF v_resolved_tenant_id IS NOT NULL THEN
    INSERT INTO public.audit_eos_events (...) VALUES (v_resolved_tenant_id, ...);
  END IF;
  ```

All other behavior (status update, solved_at/resolved_by, `issues_discussed` update) preserved. SECURITY DEFINER, `SET search_path = ''`-equivalent (`SET search_path TO 'public'` retained as existing), and `public.` prefixes maintained.

## Verification
- Normal issue with tenant_id → `COALESCE` returns the original value; behavior identical to today.
- Null-tenant issue with user in an active meeting → meeting found via relaxed WHERE; tenant resolved from meeting; audit row written.
- Null-tenant issue with no active meeting → status update succeeds; audit row skipped (acceptable per spec).

## Risk assessment
- Backward compatible: no signature/RLS/frontend change.
- Audit completeness: only skipped when no tenant can be resolved anywhere — already an unauditable orphan case.
- No impact on `IDSDialog.tsx`, other RPCs, or `audit_eos_events` historic rows.
- Low risk; single function replacement, immediately reversible by redeploying prior definition.
