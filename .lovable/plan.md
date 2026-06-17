## Goal

Rebuild `src/pages/admin/BulkMembershipCertificatesPage.tsx` into a Client Contact Register with CSC owner tabs, search, status badges, and a richer table — while preserving the entire certificate download flow byte-for-byte. Also rename the sidebar nav label.

## Files to change

1. `src/components/DashboardLayout.tsx` — change the label for the nav item with `path: "/clients/bulk-membership-certificates"` from `"Bulk Cert Download"` to `"Cert & Contact Register"`. No other edits in this file.
2. `src/pages/admin/BulkMembershipCertificatesPage.tsx` — rebuild around the existing download logic.

## Preserved verbatim (no edits)

- `SUPABASE_URL` and `SUPABASE_ANON_KEY` constants
- `useAuth`, `useRBAC`, and the `isSuperAdmin`/`isCsc` navigation guard
- The full `handleDownload` function (current lines ~97–196): JSZip flow, progress/progressLabel updates, toast messages, fetch to `generate-membership-certificate`
- `downloading`, `progress`, `progressLabel` state and their existing logic
- `<DashboardLayout>` wrapper
- The progress block UI rendered while `downloading === true`

## Interface

Replace `TenantWithMembership` with the new shape that adds `package_slug`, `status`, `csc_user_id`, `csc_name`, `primary_contact_name`, `primary_contact_email` (exactly as specified in the request).

## New state

- `activeOwner: string | null` (null = All Owners)
- `searchQuery: string`
- `statusLabelMap: Map<string, string>` (populated from `dd_status`)

## Data fetching (extend `fetchTenants`)

After `tenantIds` is known, run all queries in parallel via `Promise.all`:

- `tenants` select extended to `id, name, rto_name, status`
- `packages` select extended to `id, name, slug`
- `tenant_csc_assignments` where `is_primary = true` for the tenant IDs → then `users` lookup on `user_uuid` for `first_name, last_name`
- `tenant_users` where `relationship_role = 'primary_contact'` for the tenant IDs → then `users` lookup on `user_uuid` for `first_name, last_name, email`
- `dd_status` select `value, description` where `code >= 100`

Build lookup maps (`pkgMap`, `instMap`, `cscAssignMap`, `cscUserMap`, `contactAssignMap`, `contactUserMap`, `statusLabelMap`) and merge into the `TenantWithMembership[]` result, sorted alphabetically by `name`. Call `setStatusLabelMap` and `setTenants`.

The user-lookup queries are conditional on having any IDs (avoid empty `.in()` calls).

## Derived values (`useMemo`)

- `ownerTabs`: `[name, count][]` from tenants with a `csc_name`, sorted desc by count
- `visibleTenants`: filter `tenants` by `activeOwner` (if set), then by `searchQuery` against `name`, `primary_contact_name`, `primary_contact_email` (case-insensitive)

## Status badge helper

Local `getStatusBadge(status, labelMap)` returning a shadcn `<Badge variant="outline">` with an icon + label. Icon/color config for `active`, `disabled`, `on_hold`, `overrun`, `terminated`, `cancelled`, with a neutral fallback. Add `CheckCircle2, XCircle, Pause, AlertCircle, Archive` to the existing `lucide-react` import.

## UI layout (inside `<DashboardLayout>`)

Top row (flex, header left / panel right):

- Left: `<h1>Client Contact Register & Membership Certificates</h1>` + descriptive paragraph
- Right: Bulk download card
  - Title row: Download icon + "Bulk Download Membership Certificates"
  - Subtitle: `{selected.size} clients selected · Certificates will be bundled into a ZIP file`
  - Two buttons side by side:
    - `Select All ({visibleTenants.length})` → `setSelected(new Set(visibleTenants.map(t => t.id)))`
    - `Download Selected Certificates` (fuchsia/primary), calls `handleDownload`, disabled when `downloading || selected.size === 0`

Owner tabs row:

- "All Owners" pill first (active when `activeOwner === null`)
- One pill per entry in `ownerTabs`, label `{name}` with a small count badge
- Clicking sets/clears `activeOwner`. Selection set is NOT cleared on tab change.

Search row:

- Right-aligned input bound to `searchQuery` above the table

Table (shadcn `Table`):

| # | Header | Content |
|---|--------|---------|
| 1 | checkbox (header = select/deselect all *visible*) | per-row `<Checkbox>` |
| 2 | Group | `<Badge variant="secondary">{package_slug}</Badge>` |
| 3 | Code / Client | tenant name (bold), `rto_name` below if different |
| 4 | Contact Name | `primary_contact_name ?? "—"` |
| 5 | Email | `primary_contact_email ?? "—"` |
| 6 | Status | `getStatusBadge(status, statusLabelMap)` |

- Row click toggles its checkbox; disabled while `downloading`
- Empty state row: "No tenants with active memberships found."

Progress block: unchanged, rendered when `downloading === true`.

Loading state: unchanged.

## Out of scope

- No changes to `handleDownload`, supabase constants, RBAC guard, JSZip usage, toast strings, or DashboardLayout wrapper
- No new dependencies
- No edge function changes, no migrations
