

# Suggestion & Issue Register — Review and Recommendations

I've thoroughly reviewed the prompt against the existing Unicorn 2.0 schema and codebase. There are several critical mismatches that would cause migration failures or broken foreign keys if the prompt were used as-is.

---

## Critical Issues to Fix

### 1. `tenants.id` is `integer`, not `uuid`

The live database has `tenants.id` as type `number` (integer/bigint). The prompt defines:

```sql
tenant_id uuid not null references public.tenants(id) on delete cascade
```

This would fail. Must be changed to:

```sql
tenant_id integer not null references public.tenants(id) on delete cascade
```

This applies to both `suggest_items` and `suggest_attachments`.

---

### 2. User references should go to `public.users(user_uuid)`, not `auth.users(id)`

The existing codebase consistently references `public.users(user_uuid)` for user foreign keys. The prompt uses `auth.users(id)` for `assigned_to`, `reported_by`, `resolved_by`, `released_by`, `created_by`, `updated_by`, and `created_by` on attachments.

This matters because:
- PostgREST cannot resolve joins through `auth.users` — only `public.users`
- All other tables in the system follow this pattern
- The UI needs to join user names/avatars via `public.users`

All user UUID columns should reference `public.users(user_uuid)` instead.

---

### 3. `tenant_members` table does not exist — it's `tenant_users`

The prompt says "Use the existing tenants and tenant_members tables." The actual junction table is `public.tenant_users` with columns `tenant_id` (integer) and `user_id` (uuid referencing `public.users(user_uuid)`). RLS helpers like `has_tenant_access_safe`, `is_vivacity_team_safe`, and `is_super_admin_safe` already exist and should be used directly.

---

### 4. `users.tenant_id` is `bigint`, not `uuid`

The prompt assumes UUID-based tenancy throughout. The `users` table has `tenant_id` as `bigint`, consistent with `tenants.id` being integer.

---

## Minor Recommendations

### 5. AI title generation — reuse existing edge function pattern

The `extract-note-title` edge function already does exactly what's needed (AI title from content). Rather than creating a new edge function, we can either reuse it directly or create a thin `extract-suggest-title` variant with a tailored prompt. The pattern of calling the Lovable AI gateway with tool calling is already proven.

### 6. Speech-to-text — reuse `useSpeechToText` hook

The existing `useSpeechToText` hook is already used across 8+ components. The suggestion form should use the same hook and microphone button pattern. No new implementation needed.

### 7. Assignment dropdown — reuse `useVivacityTeamUsers`

The `useVivacityTeamUsers` hook already filters to Super Admin, Team Leader, Team Member roles. This is the correct hook for the "assigned_to" dropdown, already used in action items and notes.

### 8. Dropdown tables should be registered in code_tables

The `dd_suggest_*` tables should be accessible via the existing Code Tables admin (which auto-discovers `dd_` prefixed tables via `list_code_tables()` RPC). No special admin page is needed — the existing CodeTablesAdmin page will pick them up automatically.

### 9. Storage bucket should be private

Per the existing security standard, the `suggest-attachments` bucket should be private with signed URL access (1-hour expiry), consistent with `package-documents`, `document-files`, etc.

### 10. RLS should use existing helper functions

The database already has these SECURITY DEFINER helpers:
- `has_tenant_access_safe(user_id, tenant_id)` — tenant membership check
- `is_super_admin_safe(user_id)` — super admin check  
- `is_vivacity_team_safe(user_id)` — vivacity team check

RLS policies for `suggest_items` and `suggest_attachments` should use these directly rather than inventing new access logic.

---

## Corrected Schema Summary

```text
suggest_items.tenant_id       → integer REFERENCES public.tenants(id)
suggest_items.assigned_to     → uuid REFERENCES public.users(user_uuid)
suggest_items.reported_by     → uuid REFERENCES public.users(user_uuid)
suggest_items.resolved_by     → uuid REFERENCES public.users(user_uuid)
suggest_items.released_by     → uuid REFERENCES public.users(user_uuid)
suggest_items.created_by      → uuid REFERENCES public.users(user_uuid)
suggest_items.updated_by      → uuid REFERENCES public.users(user_uuid)
suggest_attachments.tenant_id → integer REFERENCES public.tenants(id)
suggest_attachments.created_by→ uuid REFERENCES public.users(user_uuid)
```

---

## Implementation Plan

Once the prompt corrections above are accepted, implementation would proceed as:

1. **Database migration** — Create dd_suggest_* tables, suggest_items, suggest_attachments with corrected types, seed data, RLS policies using existing helpers, storage bucket
2. **Edge function** — `extract-suggest-title` (clone of extract-note-title with adjusted prompt)
3. **Hooks** — `useSuggestItems`, `useSuggestDropdowns`, `useSuggestAttachments`
4. **Pages** — SuggestionRegister (list with filters), NewSuggestionForm, SuggestionDetail
5. **Components** — Reuse `useSpeechToText`, `useVivacityTeamUsers`, existing UI patterns
6. **Routing** — Add routes under `/suggestions`

Shall I proceed with implementation using the corrected schema?

