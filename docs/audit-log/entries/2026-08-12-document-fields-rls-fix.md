# Audit: 2026-08-12 — RLS fix for document_fields (Required Merge Fields)

**Trigger:** Ported the "Required Merge Fields" editor (`MergeFieldsEditor`,
writes to `document_fields`) from the orphaned `/document/:id` page onto the
live `GovernanceDocumentDetail` view. Carl noticed the panel rendered empty
despite an adjacent panel (Merge Field Mappings) showing real data for the
same document, then hit a visible RLS error trying to save a field.
**Author:** Claude (session run by Carl)
**Scope:** RLS policy fix on one table (`document_fields`). No trigger,
column, or data changes. Verified no data loss occurred before the fix
shipped.
**Supabase project:** hosted `unicorn-cms-f09c59e5` production project.

---

## Findings

- **`document_fields` was effectively unusable by any Vivacity staff member,
  and had been since inception** — it just never surfaced because its only
  UI (`MergeFieldsEditor`) lived on `/document/:id`, a route with zero live
  entry points (confirmed via full-repo grep earlier the same session: the
  sole `navigate()` call to that route, `handleSendDocument` in
  `ManageDocuments.tsx`, is itself dead code never wired to a button).
- **Two broken RLS policies, two different failure modes:**
  - `document_fields_select_via_canonical_helper` (SELECT) requires a tenant
    match via `documents.tenant_id` — never satisfied for master/governance
    templates, which have no tenant. This is why the panel rendered "No
    required merge fields defined" even though 6 real rows existed in the
    DB for the document being viewed (id 7628) — the fetch silently
    returned empty and `MergeFieldsEditor` swallows fetch errors without a
    toast.
  - `document_fields_superadmin_all` (ALL) gates on `is_superadmin()`, which
    checks `users.global_role = 'superadmin'`. Queried `public.users`:
    **7 of the 9 real Super Admin accounts have `global_role` sitting
    `NULL`** — only 2 rows in the entire table ever had it populated. This
    is why the save attempt threw "new row violates row-level security
    policy for table document_fields" instead of silently failing.
- **No data loss.** The component's `handleSave` does an unconditional
  `DELETE ... WHERE document_id = X` followed by re-INSERT, with no error
  check on the delete. Confirmed via direct query that the delete was also
  silently blocked by the same RLS gap (0 rows actually removed) before the
  insert failed loudly — the original 6 rows for document 7628 were
  verified intact both before and after the failed save attempt.
- **The correct pattern already exists next to it.** `document_template_mappings`
  (the "Merge Field Mappings" panel, same page, doing an adjacent but
  distinct job — see Decisions) solves the identical staff-write problem
  correctly, gating all four operations on `users.is_vivacity_internal =
  true`. Queried `public.users`: this column is populated cleanly for all 9
  Super Admins plus every other internal role (CSC, Team Member,
  Integrator, BGT) — it's the column this app actually maintains, unlike
  `global_role`.

---

## DB changes shipped

Migration: `supabase/migrations/20260812042919_fix_document_fields_vivacity_staff_access.sql`

Adds four new policies to `document_fields` (select/insert/update/delete),
copying `document_template_mappings`'s working pattern verbatim: gate on
`exists (select 1 from users where user_uuid = auth.uid() and
is_vivacity_internal = true)`. The two existing broken policies
(`document_fields_select_via_canonical_helper`,
`document_fields_superadmin_all`) were left in place rather than dropped —
Postgres RLS policies are permissive/OR'd, so this only adds a working
access path without narrowing anything or risking an unrelated regression.

Applied directly to prod via Supabase MCP `apply_migration`
(`fix_document_fields_vivacity_staff_access`, version `20260812042919`).

## Code changes

- `src/components/governance/GovernanceDocumentDetail.tsx` — added
  `MergeFieldsEditor` (unmodified) next to `GovernanceTailoringHealth`, since
  one reads what the other writes. This is the change that first exercised
  `document_fields` through a reachable UI and surfaced the RLS bug above.
- `supabase/migrations/20260812042919_fix_document_fields_vivacity_staff_access.sql`
  — see above.

Branch: `hotfix/governance-required-fields-port`. PR #252.

---

## Decisions

- **Not the same thing as `document_template_mappings`, despite the visual
  resemblance Carl flagged.** Mapping Editor is freeform, per-template-
  version, and gates whether a version can even be published
  (`import-sharepoint-template/index.ts:467-477` refuses to publish without
  at least one mapping row) — its job is telling the generator what to
  substitute and what default to fall back to. `document_fields` is
  document-level, catalog-linked (`dd_fields`), and drives the delivery-time
  completeness/risk check in `deliver-governance-document/index.ts:858-875`
  — its job is grading whether required fields were actually populated
  before a real client delivery. Confirmed both are populated together at
  SharePoint import time by the same scan
  (`classifyAndSyncMergeFields` in `import-sharepoint-template/index.ts`),
  so under normal operation they should already roughly agree; the manual
  `MergeFieldsEditor` UI is a hand-curation escape hatch on top of that
  auto-sync, not a duplicate of the Mapping Editor.
- **Left the two broken policies in place** rather than cleaning them up,
  to keep this a strictly additive, low-risk fix. `document_fields_superadmin_all`
  is dead weight for 7 of 9 admins but harmless to leave; the tenant-scoped
  SELECT policy is simply never true for tenant-less documents. Neither
  actively restricts anything now that the new policies exist.

## Open questions parked

- **`global_role` looks like an abandoned column beyond just this table** —
  worth checking whether `is_superadmin()` is relied on by other RLS
  policies in the same broken way. Not audited here; scoped this fix to the
  one table the session was actually touching.
- **Manual edits via `MergeFieldsEditor` will be silently overwritten on
  the next SharePoint re-import**, since `classifyAndSyncMergeFields` does
  its own delete+reinsert of `document_fields` from the template scan. Not
  a bug introduced here, but worth surfacing to Carl if hand-curation of
  required fields becomes a real workflow — the UI gives no indication a
  re-import will blow away manual changes.
