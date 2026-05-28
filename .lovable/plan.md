# Governance Documents (Client Portal)

Replace the existing **Documents** feature in the client portal with a new read-only **Governance Documents** page available only to primary/secondary contacts.

## 1. Remove the Documents feature from the client portal

**Sidebar — `src/components/client/ClientSidebar.tsx`**
- Remove the `{ icon: FileText, label: "Documents", path: "/client/documents" }` entry from `clientMenuItemsBefore`.
- Remove the now-unused `FileText` import if nothing else uses it.

**Router — `src/App.tsx`**
- Remove the lazy import `ClientDocumentsWrapperNew` and the `<Route path="/client/documents" …>`.

**Incoming links to `/client/documents`** (must be updated so nothing routes to the removed page):
- `src/components/client/ClientHomePage.tsx` — two `<Link to="/client/documents…">` (one plain, one `?tab=governance`). Repoint both to `/client/governance-documents`. The second is only meaningful for users who can access it — wrap that link (or render plain text) when `canManagePortalUsers` is false.
- `src/components/client/ClientFooter.tsx` — link `/client/documents` → repoint to `/client/governance-documents`.
- `src/components/client/ClientUpcomingAuditSection.tsx` — link `/client/documents` → repoint to `/client/governance-documents`.
- `src/components/dashboard/MomentumBanner.tsx` — both branches return `/client/documents`; repoint to `/client/governance-documents`.
- `src/components/layout/TopBar.tsx` — replace the `"/client/documents": "Documents"` breadcrumb entry with `"/client/governance-documents": "Governance Documents"`.

**Files that can be deleted** (verified only referenced by the removed client Documents route):
- `src/pages/client/ClientDocumentsWrapper.tsx`
- `src/components/client/ClientDocumentsPage.tsx`
- `src/components/client/ClientGovernanceRegister.tsx`
- `src/components/client/ClientDocumentRequests.tsx`

**Out of scope / left alone:**
- `src/components/DashboardLayout.tsx` — staff dashboard layout, unrelated to client portal sidebar; keep its Documents entry untouched.
- `src/hooks/useDocumentRequests.tsx` — used by staff code paths; leave in place.
- All other Documents code outside the client portal (e.g. `DocumentsHub`, `ClientSharePointDocumentsTab`, staff-side `ClientPortalDocuments`).

## 2. Add the Governance Documents sidebar entry

In `clientMenuItemsBefore`, in the same slot vacated by Documents (immediately after Packages):

```ts
{ icon: ScrollText, label: "Governance Documents", path: "/client/governance-documents", adminOnly: true }
```

Import `ScrollText` from `lucide-react`. The existing `filterAdmin` + `canManageUsers` logic already gates `adminOnly` entries to primary/secondary contacts (and SuperAdmins/preview).

## 3. New route + wrapper

- Add a lazy route `/client/governance-documents` in `src/App.tsx` rendering the new page inside `ClientLayout` (mirror the wrapper pattern used by other client pages such as `ClientDocumentsWrapper`).
- Create `src/pages/client/ClientGovernanceDocumentsWrapper.tsx` that wraps `ClientGovernanceDocumentsPage` in `<ClientLayout>`.

## 4. New component — `ClientGovernanceDocumentsPage`

Create `src/components/client/ClientGovernanceDocumentsPage.tsx`.

**Access guard**
- Read `{ activeTenantId, canManagePortalUsers, isPreview }` from `useClientTenant()`, plus `isSuperAdmin` from `useAuth()`.
- If `!(canManagePortalUsers || isPreview || isSuperAdmin())`, `<Navigate to="/client/home" replace />`. Matches the sidebar gate.

**Data query** (React Query, keyed on `activeTenantId`):

```sql
SELECT
  gd.id, gd.generated_at, gd.file_path, gd.file_name,
  d.title, d.description, d.category, d.framework_type,
  cat.label  AS category_label,  cat.sort_order AS category_sort,
  fw.label   AS framework_label,
  p.name     AS package_name
FROM generated_documents gd
JOIN documents d ON d.id = gd.source_document_id
LEFT JOIN dd_document_categories cat ON cat.value = d.category
LEFT JOIN dd_governance_framework  fw  ON fw.value  = d.framework_type
LEFT JOIN stage_instances si   ON si.id = gd.stage_id
LEFT JOIN package_instances pi ON pi.id = si.packageinstance_id
LEFT JOIN packages p           ON p.id  = pi.package_id
WHERE gd.tenant_id = :activeTenantId
  AND gd.status = 'generated'
  AND gd.is_client_visible = true
ORDER BY cat.sort_order NULLS LAST, d.title ASC;
```

Implemented as a Supabase `.from('generated_documents').select(...)` with nested foreign-table selects, then a small client-side flatten. (Existing RLS already restricts `generated_documents` to the tenant's users — no policy changes needed.)

**Page layout** (styled to match `ClientPackagesPage`, reusing `Table`, `Input`, `Select`, `Badge`, `Button`, `Skeleton` from `@/components/ui/*`):
- Heading: `Governance Documents`
- Sub-heading (muted): `Documents generated for your organisation as part of your compliance package.`
- Filter row:
  - Debounced (~250 ms) search input across `title`, `description`, `category_label`, `framework_label`.
  - Category `Select` — distinct `category_label`s present in the loaded results.
  - Framework `Select` — distinct `framework_label`s present in the loaded results.
  - `Clear filters` button shown when any filter is active.
- Table columns: Document Title · Category · Framework · Description (1-line truncate + tooltip with full text) · Package (`—` if null) · Generated (formatted `DD Month YYYY` via `date-fns` `dd MMMM yyyy`) · Actions (Download).

**Download**
- For each row with `file_path`, call `supabase.storage.from(<bucket>).createSignedUrl(file_path, 60)` on click, then trigger download using an `<a download={file_name}>` programmatic click.
- If `file_path` is null, render disabled `Button` with tooltip `File not available`.
- Bucket name: discover from existing generation code during implementation (likely `generated-documents`); if absent, fall back to the bucket already used by staff `DocumentsHub` downloads to stay consistent.

**States**
- Loading: skeleton rows.
- Empty after filters: `No governance documents found.`
- Zero records for tenant: `No governance documents have been generated for your organisation yet. These will appear here once your consultant has generated them as part of your package.`
- Read-only: no edit/delete/upload.

## 5. Verification

- Build passes; sidebar shows **Governance Documents** in the Packages slot for admins only.
- Visiting `/client/documents` no longer resolves (route removed); legacy links (Footer, HomePage, MomentumBanner, UpcomingAudit, TopBar breadcrumb) all point to the new path.
- Page renders, filters/search/clear work, signed-URL download works, disabled state shown when `file_path` is null, both empty states render correctly.
- Non-admin client user is redirected from `/client/governance-documents` to `/client/home`.

## Out of scope
- Schema changes (all required tables/columns already exist).
- Any staff-facing Documents UI.
- The previously discussed SharePoint recursive folder-copy work (separate plan, still pending approval).
