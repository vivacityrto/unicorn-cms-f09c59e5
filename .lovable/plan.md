## Delete Incomplete Audits (with reason capture)

Strictly additive feature. No existing audit tables, columns, RLS policies, or edge functions are modified. Cascade FKs already exist on all child tables (verified).

### Schema reality check (verified against the live DB)
- `client_audits.subject_tenant_id` is **bigint**, not uuid. The plan's `::uuid` cast is dropped.
- The helpers `is_active_staff()` and `can_access_client(uuid)` **do not exist** in this project. The actual conventions used by the existing `client_audits` RLS policies are:
  - `is_vivacity_team_safe(auth.uid())` for staff access
  - `tenant_members` membership for tenant users
- `client_audit_log` columns match the prompt: `tenant_id bigint`, `actor_user_id`, `action`, `entity_type`, `entity_id text`, `details jsonb`, `before_data jsonb`.
- FK behaviour (already in place):
  - CASCADE: `client_audit_sections`, `client_audit_responses`, `client_audit_findings`, `client_audit_actions`, `client_audit_documents`, `audit_appointments`
  - SET NULL: `evidence_requests.audit_id`, `portal_documents.linked_audit_id`, `stage_instances.linked_audit_id`

### 1. Migration — `audit_deletion_helpers.sql`
Adds one SECURITY INVOKER gate function. No new RLS policy on `client_audits`.

```sql
create or replace function public.can_delete_incomplete_audit(p_audit_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.client_audits a
    where a.id = p_audit_id
      and (
        public.is_vivacity_team_safe(auth.uid())
        or exists (
          select 1 from public.tenant_members tm
          where tm.tenant_id = a.subject_tenant_id
            and tm.user_id = auth.uid()
        )
      )
      and a.status in ('draft','in_progress')
      and a.closed_at is null
      and a.report_generated_at is null
  );
$$;

comment on function public.can_delete_incomplete_audit(uuid) is
  'Gate: caller must be Vivacity staff or a member of the audit tenant, and the audit must still be incomplete (not closed, no report generated).';

comment on column public.client_audit_log.action is
  'Examples: audit.created, audit.status_changed, audit.report_generated, audit.report_released, audit.deleted_incomplete';
```

### 2. Edge Function — `supabase/functions/delete-incomplete-audit/index.ts`
- Uses caller JWT (anon key client + Authorization header). **Never** uses service role key.
- Reuses `../_shared/cors.ts`.
- Validates `audit_id` (required) and `reason` (10–1000 chars, trimmed).
- Calls `rpc('can_delete_incomplete_audit', { p_audit_id })` → 403 if not allowed.
- Selects full snapshot of `client_audits` row (RLS-scoped).
- Inserts `client_audit_log` with `action='audit.deleted_incomplete'`, `tenant_id = subject_tenant_id`, `actor_user_id = user.id`, `entity_type='client_audits'`, `entity_id = audit_id`, `details = { reason, audit_type, title, status_at_deletion, deleted_at }`, `before_data = snapshot`.
- Deletes the audit row; cascades handle children.
- Returns `{ ok: true }` on success; structured `{ error, detail? }` with 400/401/403/404/500 otherwise. Australian English copy.

### 3. Frontend UI
**Delete trigger placement:** add a "Delete audit" item to the existing kebab/actions menu on:
- The audit detail page (`AuditWorkspace.tsx` header actions area)
- Each row of the audits list (`AuditsAssessments.tsx`)

**Visibility rule** (computed from the audit row already in scope):
```ts
const showDeleteOption =
  (audit.status === 'draft' || audit.status === 'in_progress') &&
  audit.closed_at == null &&
  audit.report_generated_at == null;
```
If false, the menu item is not rendered.

**Confirmation dialog** — shadcn `Dialog` (not AlertDialog, because of the textarea):
- Title: `Delete this audit?`
- Description: explains permanence, lists what gets removed, notes locked-audit rule.
- Summary block: title, audit type, client name, status, created date.
- Required textarea labelled `Reason for deletion *`, placeholder `e.g. Duplicate of audit XYZ created in error`. Live `{count}/1000` counter. Inline validator: min 10, max 1000.
- Buttons: `Cancel` (default) and `Delete audit` (destructive, disabled until valid, spinner while in flight).
- Keyboard: Escape cancels, focus trapped, focus returns to trigger.

**Submit handler:**
```ts
const { data, error } = await supabase.functions.invoke(
  'delete-incomplete-audit',
  { body: { audit_id, reason } }
);
```
On success: `toast.success('Audit deleted.')`, `queryClient.invalidateQueries({ queryKey: ['client_audits'] })`, navigate back to `/audits` (only when triggered from the detail page; from the list, just stay).

**Error handling:**
- 403 (audit no longer deletable): show server message, close dialog, refetch audit row so UI reflects new status.
- Network failure: keep dialog open, show inline error, preserve typed reason for retry.

### 4. SuperAdmin visibility
Out of scope for this PR. No SuperAdmin audit-log viewer is built or modified here. (Logged as follow-up: filterable view of `client_audit_log` entries with `action='audit.deleted_incomplete'`, expanding `details.reason`.)

### 5. Out of scope (do not build)
- Soft-delete / restore.
- Bulk deletion.
- Deleting completed/closed audits.
- Any change to existing audit RLS, FK rules, or creation flow.
- New SuperAdmin audit-log viewer.

### 6. Acceptance criteria
- Vivacity staff (or tenant member, per existing RLS) can delete a `draft` or `in_progress` audit after typing a 10+ char reason.
- Audits with `closed_at` or `report_generated_at` set: menu item hidden, forced API call returns 403.
- Users without RLS access to the tenant: gate returns false, function returns 403.
- `client_audit_log` row exists with full snapshot in `before_data` and `details.reason` populated.
- After deletion: audit row + all CASCADE child rows gone; `evidence_requests.audit_id`, `portal_documents.linked_audit_id`, `stage_instances.linked_audit_id` set to NULL on rows that referenced the audit.
- Destructive button disabled <10 chars; counter and inline message shown.
- No new RLS policy on `client_audits`; no service role key used; Australian English throughout.

### Files to be created / edited
- **New:** `supabase/migrations/<timestamp>_audit_deletion_helpers.sql`
- **New:** `supabase/functions/delete-incomplete-audit/index.ts`
- **New:** `src/components/audit/DeleteAuditDialog.tsx` (reason-capture dialog)
- **Edited:** `src/pages/AuditWorkspace.tsx` (add menu item + dialog wiring on detail page)
- **Edited:** `src/pages/AuditsAssessments.tsx` (add per-row menu item + dialog wiring)

Approve to switch to build mode and apply.
