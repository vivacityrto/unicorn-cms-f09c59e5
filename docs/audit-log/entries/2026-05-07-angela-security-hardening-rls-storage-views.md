# Audit: 2026-05-07 — angela-security-hardening-rls-storage-views

**Trigger:** ad-hoc — Angela ran Lovable security agent scan and applied fixes directly in Lovable. Audit doc authored by Khian (Brian) to record findings, implication analysis, and storage bucket verification.
**Author:** Khian (Brian Sismundo) · **Reviewer:** Carl
**Scope:** Migration `20260507004016_f28832d5-b4fa-44fb-ae59-92a75889e921.sql` — 6 security fixes across `auth_tokens`, `profiles`, `eos_workspaces`, storage `task-evidence`, storage `task-files`, and two views. Did not touch messaging, invite flow, CSC assignment, or any other tables.

---

## What Angela fixed (Lovable security agent — 7 May 2026)

Seven issues reported; 7 fixed; 1 accepted as legacy risk (ClickUp OAuth token exposure).

### 1. `auth_tokens` — client-side write policies removed

Dropped `auth_tokens_insert`, `auth_tokens_update`, `auth_tokens_delete` (permissive, any authenticated user). Replaced with `auth_tokens_admin_insert/update/delete` gated on `is_super_admin_safe(auth.uid())`. Service role bypasses RLS automatically — edge functions unaffected.

### 2. `profiles` — cross-tenant SELECT tightened

Dropped `profiles_select_same_tenant` (any tenant member could read all profiles in their tenant). Replaced with `profiles_select_same_tenant_admin` — restricted to users whose `role` is `admin`, `tenant_admin`, or `superadmin` in the same tenant. Own-profile reads (via a separate own-select policy) still work for all users.

### 3. `eos_workspaces` — permissive SELECT removed

Dropped `eos_workspaces_select` (USING (true) — every authenticated user could read every row). Vivacity team and super admin policies remain. No client-facing code queries this table directly; the client portal shows released audit reports only (via `ClientAuditReportsSection` on the home page). Staff-side audit workspace at `/audits/:id` still works — covered by Vivacity/admin policies.

### 4. Storage `task-evidence` — tenant derived from file path

Dropped 3 broad policies. Added `task_evidence_select_tenant_scoped`, `task_evidence_insert_tenant_scoped`, `task_evidence_delete_owner_or_admin`. Tenant is now derived from `(foldername(name))[1]` cast to bigint, checked via `has_tenant_access_safe`. Delete requires file owner or super admin in addition to tenant access.

### 5. Storage `task-files` — tenant derived via `tasks_tenants` join

Dropped 4 policies that used `get_current_user_tenant()` (was a no-op — returned user's current tenant without actually scoping to the task's tenant). Rewrote all 4 operations (SELECT, INSERT, UPDATE, DELETE) to join `public.tasks_tenants` and check `has_tenant_access_safe(t.tenant_id, auth.uid())` where the first path segment equals the task ID.

### 6. Views — `security_invoker = true` applied

`ALTER VIEW public.v_client_dashboard_progress SET (security_invoker = true)` and `ALTER VIEW public.v_client_home_hero SET (security_invoker = true)`. Both views now formally enforce caller RLS context. The 2026-05-04 audit noted these as already `security_invoker = true` in migration SQL, but the DB setting was not confirmed at that time; this migration formalises it.

---

## Findings

- **`auth_tokens` change is safe.** All writes to `auth_tokens` go through edge functions running as service role (RLS bypassed). No client-side code writes auth tokens directly. No regression.

- **`profiles` SELECT tightening — own-profile reads unaffected; cross-profile reads for non-admin users now return empty.** `useAuth` reads the user's own profile (own-select policy intact). `ClientTenantContext` derives `activeTenantId` from `users.tenant_id` (bigint via `public.users`), not `profiles`. The `accept_invitation_v2` fix (2026-05-06) writes `UPDATE profiles` — that is a write, not a SELECT; unaffected. The `users_select_assigned_csc` policy (2026-05-06) is on `public.users`, not `profiles`; unaffected. Risk: any non-admin client user UI that reads another user's profile for display (avatars, names) will now get nulls. Client home page confirmed working in browser by Khian (Brian) post-deploy.

- **`eos_workspaces` SELECT removal — no client regression confirmed.** Client portal does not query `eos_workspaces` directly. Released audit reports surface via `ClientAuditReportsSection` (queries `client_audits`, not `eos_workspaces`). Staff audit workspace at `/audits/:id` is protected by Vivacity team / super admin policies that remain in place.

- **`task-evidence` bucket — empty. No files to verify.** 0 objects in the bucket. New uploads will work as long as the upload path is `{tenant_id}/{filename}`.

- **`task-files` bucket — 22 files, all now locked out. All are Nov 2025 legacy objects.** SQL verification confirmed: all 22 objects have UUID first path segments. The new policy requires the first segment to match a `tasks_tenants.id`. Zero of 22 match. All files date from 19–27 November 2025 (Unicorn 1.0 / early dev era, predating the `tasks_tenants` table design). The old `get_current_user_tenant()` policy was already documented as a no-op in the security summary — these files may have been accessible via that broken broad policy but were never correctly scoped. **Angela and Carl to decide: delete the 22 legacy objects, or migrate paths.** This is not a new regression introduced by this fix — it surfaces a pre-existing data/path convention mismatch.

- **Views `security_invoker = true` — no regression.** `v_client_home_hero` was already effectively running in caller context (confirmed in the 2026-05-06 CSC card audit). `v_client_dashboard_progress` behaviour is consistent with the formalised setting. The CSC hero tile continues to resolve via `users_select_assigned_csc` (on `public.users`, unaffected by `profiles` tightening).

---

## Storage bucket SQL verification

Queries run against `supabase-unicorn` (project `yxkgdalkbrriasiyyrwk`) post-migration:

```
task-evidence: total=0, conforming=0, non_conforming=0  → empty, clean
task-files:    total=22, matched_to_task=0, unmatched=22 → all legacy UUID-path objects
```

Breakdown of `task-files` first segments: 14 distinct UUID values across 22 files, all created between 2025-11-19 and 2025-11-27.

---

## KB changes shipped

No KB changes in this session.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5 @ 564fd55d` — commit containing the security migration `20260507004016`. Pulled at session start after Angela's Lovable run.
- `unicorn-cms-f09c59e5 @ fe40bf24` — latest HEAD at time of audit close ("Approved Lovable tool use", 2026-05-07). Minor changes: `NotificationDropdown.tsx`, `TeamCommunicationsPage.tsx`, `supabase/types.ts`. Unrelated to security fixes.
- Migration file: `supabase/migrations/20260507004016_f28832d5-b4fa-44fb-ae59-92a75889e921.sql`

---

## Decisions

- ClickUp OAuth token exposure accepted as legacy risk (Angela's call, pre-existing).
- `task-files` UUID-path objects left in place pending Angela/Carl decision on delete vs migrate — not actioned in this session.

---

## Open questions parked

- **22 legacy `task-files` objects** — UUID first segments, all Nov 2025. All locked out by new policy. Angela or Carl to confirm whether safe to delete. If delete is confirmed, a super admin can remove via Supabase storage dashboard or a one-off script.
- **`profiles_select_same_tenant_admin` — non-admin profile reads** — any non-admin UI feature that reads a colleague's `profiles` row (e.g., displaying a peer's avatar/name via the `profiles` table rather than `users`) will now silently return null. No such feature identified in scope of this audit, but worth a full grep of `profiles` selects in client-facing hooks if issues surface.
- **`v_client_dashboard_progress` view internals** — not inspected in detail for `profiles` joins. If this view joins `profiles` for display data for non-admin callers, those fields may now be null. Browser test of client dashboard progress section recommended.
- **Bug #1 (tenants_id_seq desync)** — carried from 2026-05-06 sessions. Still unresolved. Fix SQL known (`SELECT setval('tenants_id_seq', (SELECT max(id) FROM public.tenants))`), not yet applied.

---

## Tag

`audit-2026-05-07-angela-security-hardening-rls-storage-views`
