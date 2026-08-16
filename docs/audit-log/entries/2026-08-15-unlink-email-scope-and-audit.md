# Audit: 2026-08-15 — unlink-email scope, permission gate, and soft delete

**Trigger:** ad-hoc (scope-and-audit of the live `unlink-email` edge function)
**Scope:** `supabase/functions/unlink-email`, `email_messages` RLS / columns,
`permission_features` / `role_permissions` for the new email-management key,
`client_audit_log` writes, and the two capture paths that would otherwise
collide with the unique `(user_uuid, external_message_id)` index after a
soft unlink. Did not change `public.emails` (stage email templates) beyond
using `emails_restrict_staff_only` as the pattern for the new restrictive
policy on `email_messages`.
**Author:** Cursor (cloud agent)
**Supabase project:** hosted Unicorn 2.0 (`yxkgdalkbrriasiyyrwk`).

## Findings

- **The deployed function could not boot.** `corsHeaders` was imported from
  `npm:@supabase/supabase-js@2/cors`, which is not a real export. The
  project's shared module is `supabase/functions/_shared/cors.ts` (same
  broken import exists on `academy-fetch-vimeo-transcript`, left untouched).
- **Authorization was a seven-role allowlist** (`Super Admin`, `Team Leader`,
  `Team Member`, `Integrator`, `BGT`, `CSC`, `CET`) plus
  `users.is_vivacity_internal`, not `check_permission`. No
  email-management row existed in `permission_features` — the only email
  key was `admin.email_templates.manage` (system templates, Super Admin
  only), which is the wrong gate.
- **No tenant / RLS scoping on the read.** After the role check, the
  function loaded and deleted via the service-role key, so
  `email_messages` RLS never ran. Any staff member who passed the
  allowlist could unlink any `email_id` in the table. Live SELECT on
  `email_messages` is already `owner OR is_vivacity_team_safe OR
  is_super_admin_safe`; Vivacity staff are treated as having access to
  every tenant (`has_tenant_access_safe` / `app.user_can_access_tenant`
  both short-circuit on `is_vivacity_team`). The real hole was the
  service-role bypass, not a missing per-CSC assignment check.
- **`emails_restrict_staff_only` lives on `public.emails`** (stage email
  templates), not on `email_messages`. The function operates on
  `email_messages` (UUID `email_id`). A matching restrictive policy
  (`email_messages_restrict_staff_only`, same `is_staff() OR
  is_super_admin()` predicate) is what an ANON+JWT fetch actually hits.
- **Hard delete of attachments, storage objects, and converted notes**
  with no audit row. `public.audit_log` was moved to `archive` in May
  2026; the live table for this kind of staff action is
  `client_audit_log` (staff INSERT already allowed via
  `is_vivacity_team_safe`).
- **Write-path sweep before adding columns** (nullable, no CHECK / NOT
  NULL): frontend `.from('email_messages')` only in
  `src/hooks/useLinkedEmails.tsx`. RPCs whose body mentions
  `email_messages` + insert/update: `merge_tenants` only (does not
  supply the new columns). Trigger: `update_email_messages_updated_at`.
  Edge writers: `capture-outlook-email`, `addin-email-capture`,
  `addin-email-create-task`, `addin-email-link-attachments`,
  `generate-email-note`. Unique index
  `email_messages_unique_per_user` on `(user_uuid, external_message_id)`
  means a soft-unlinked row would block a later re-link insert unless
  the capture paths clear `unlinked_at`.

## Code changes (this entry accompanies one)

- New feature key `clients.emails.manage` ("Manage linked emails") with
  `full` for all seven staff roles that the old allowlist accepted.
- `email_messages.unlinked_at` / `unlinked_by`; SELECT hides unlinked
  rows; restrictive staff-only policy added.
- `unlink-email` rewritten: shared CORS import, `check_permission`,
  ANON+JWT fetch (404 if RLS hides the row), soft delete by default,
  hard delete only when `hard_delete: true` and the caller is Super
  Admin, `client_audit_log` insert **before** the mutation.
- `useLinkedEmails` / `LinkedEmailsList` exclude unlinked rows and drop
  the "permanently remove" copy.
- `capture-outlook-email` and `addin-email-capture` clear
  `unlinked_at` / `unlinked_by` so a previously unlinked message can be
  linked again without tripping the unique index.

## Decisions

- Soft delete is the default product path. Hard delete stays in the
  function for Super Admin only and is not exposed in the UI.
- Audit rows go to `client_audit_log` (live), not `archive.audit_log`.
- Did not invent a tighter-than-staff tenant check. Platform helpers
  already treat every Vivacity team member as having access to every
  tenant; scoping is "RLS must see the row under the caller's JWT".
- Created `clients.emails.manage` rather than reusing
  `admin.email_templates.manage`, which would have locked the unlink
  button to Super Admin.

## Verification

- Migration applied to hosted `yxkgdalkbrriasiyyrwk` as
  `unlink_email_soft_delete_and_permission`. Confirmed
  `email_messages.unlinked_at` / `unlinked_by`, feature key
  `clients.emails.manage` with `full` for all seven staff roles, SELECT
  hides `unlinked_at IS NOT NULL`, and restrictive
  `email_messages_restrict_staff_only` (`is_staff() OR is_super_admin()`).
- `unlink-email` deployed as version 49 with
  `import { corsHeaders } from "../_shared/cors.ts"` (plus the shared
  file in the bundle). `verify_jwt` remains false.
- Boot probe against the live function:
  - `OPTIONS` → 200 `ok` with the shared CORS allow-headers
  - `POST` with no `Authorization` → 401
    `{"error":"Missing Authorization header"}` (handler ran; not a
    worker boot / import crash)
  - `POST` with the anon key as Bearer → 401 `{"error":"Unauthorized"}`
- `capture-outlook-email` and `addin-email-capture` relink changes are
  in this PR and still need a hosted deploy so a later re-link does not
  collide with `(user_uuid, external_message_id)`.

## Open questions parked

- `academy-fetch-vimeo-transcript` still imports CORS from the same
  broken `npm:@supabase/supabase-js@2/cors` path.
- Ask Viv corpus / `embed-ask-viv-corpus` still reads `email_messages`
  without an `unlinked_at IS NULL` filter (service role), so unlinked
  bodies could remain in the assistant index until the next rebuild.
- `generate-email-note` was not changed; an ANON fetch of an unlinked
  email now 404s, which is the intended hide.
