

## Plan: Route New Audit creation through Edge Function

### Investigation
<lov-tool-use id="toolu_vrtx_01NtKVaAVTtsBZ2AfrWqwYBr" name="code--view" integration-id="code" data="{\"file_path\": \"src/hooks/useClientAudits.ts\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_019oiAdwnTfB3tbkkiRcsT6k" name="code--view" integration-id="code" data="{\"file_path\": \"src/hooks/useClientAudits.ts\"}">
</lov-tool-use>
I have enough context. The `useCreateAudit` mutation does the direct insert. The user's plan template references different field names (`rto_name`, `client_tenant_id`, `profiles.role`, `tenant_members`) than what's actually in the codebase (`subject_tenant_id`, snapshot fields, `users.unicorn_role`, `tenant_users`). I'll adapt accordingly.

<lov-plan>

## Plan: Route audit creation through Edge Function to fix RLS violation

### Root cause
`useCreateAudit` in `src/hooks/useClientAudits.ts` calls `supabase.from('client_audits').insert(...)` directly from the browser. RLS on `client_audits` requires the inserter to be a member of the subject tenant (or staff). When a Vivacity consultant viewing a client tenant they're not a member of clicks Create Audit, the insert is rejected.

### Fix: new Edge Function `create-client-audit`

**File:** `supabase/functions/create-client-audit/index.ts`

- Verify caller JWT via `getClaims()`.
- Resolve caller identity from `public.users` (matching the project's identity model — `user_uuid`, `unicorn_role`, `superadmin_level`). Allow if:
  - `unicorn_role` is set (Vivacity staff), OR
  - caller is in `tenant_users` for `subject_tenant_id`.
- Otherwise return 403.
- Use service-role client to insert into `client_audits` with the full payload accepted from the body (mirroring all fields currently set in `useCreateAudit`: `audit_type`, `subject_tenant_id`, `title`, `status:'draft'`, `is_rto`, `is_cricos`, `conducted_at`, `lead_auditor_id`, `assisted_by_id`, `training_products`, `doc_number`, all `snapshot_*` fields, `template_id`, `linked_stage_instance_id`, `ai_analysis_status:'none'`, `created_by`).
- Also perform the two follow-up writes server-side (so they run with consistent privileges):
  - update `stage_instances.linked_audit_id` if `linked_stage_instance_id` provided
  - insert `client_timeline_events` row
- Return `{ id }`.
- Standard CORS + OPTIONS handler.
- Note: project uses the actual schema field names (`subject_tenant_id`, `snapshot_rto_name`, etc.) — not the generic `rto_name`/`tenant_id` shown in the prompt template. The function will use the schema's real names.

### Frontend change
**File:** `src/hooks/useClientAudits.ts`

Replace the direct insert in `useCreateAudit.mutationFn` with `supabase.functions.invoke('create-client-audit', { body: {...input, title, template_id, created_by} })`. Drop the inline stage_instances and timeline writes (now done server-side). Keep the existing `onSuccess` (invalidate queries, toast, navigate) and `onError` handlers unchanged.

`subject_tenant_id` already comes from the caller (`NewAuditModal` → `preselectedTenantId`), so no additional context wiring is needed.

### Out of scope
- No DB schema or RLS changes — the existing RLS is correct; we're just routing the privileged write through the proper server-side path per Framework §4.
- No changes to `NewAuditModal`, the wizard UI, or any read paths.
- `useAudit` / `useClientAudits` reads continue via RLS (staff bypass already works for reads).

### Files
- New: `supabase/functions/create-client-audit/index.ts`
- Edit: `src/hooks/useClientAudits.ts` (mutationFn body only)

### Acceptance
1. Consultant viewing tenant 7532 can complete the 3-step wizard and the row lands in `client_audits` with `subject_tenant_id = 7532`.
2. Stage-instance back-link and timeline event are written.
3. On success, navigates to `/audits/:id`; failures surface as toasts.
4. No service-role key in browser bundle / network tab.

