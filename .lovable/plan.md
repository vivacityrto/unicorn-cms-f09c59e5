

# Stage 7: Client Document Register -- Final Verified Plan

## Pre-Implementation Audit

### Schema Confirmed (Live Database)

`governance_document_deliveries` columns available:

| Column | Type | Nullable | Purpose |
|--------|------|----------|---------|
| `id` | uuid | NO | Row key |
| `tenant_id` | bigint | NO | Tenant filter (FK to `tenants`) |
| `document_id` | bigint | NO | Fallback grouping key |
| `document_version_id` | uuid | NO | Version enrichment (FK to `document_versions`) |
| `status` | text | NO | Filter to `'success'` |
| `delivered_file_name` | text | YES | Document title |
| `category_subfolder` | text | YES | Category filter |
| `delivered_at` | timestamptz | NO | Date column |
| `tailoring_risk_level` | text | YES | Badge (complete/partial/incomplete) |
| `sharepoint_web_url` | text | YES | External link |
| `snapshot_id` | uuid | YES | Available for future use |

### RLS Verified (Zero Changes Needed)

| Table | Client Access | Policy |
|-------|--------------|--------|
| `governance_document_deliveries` | Own tenant only | `EXISTS (SELECT 1 FROM tenant_users tu WHERE tu.tenant_id = ... AND tu.user_id = auth.uid())` |
| `document_versions` | All authenticated | `qual: true` permissive SELECT |
| `documents` | **NOT QUERIED** | RLS blocks client access when `tenant_id = NULL` |

### Critical Design Decision

Governance documents in the `documents` table have `tenant_id = NULL` (master templates). The RLS policy `has_tenant_access_safe(tenant_id, auth.uid())` returns `false` for client users when `tenant_id` is `NULL`. The plan avoids `documents` entirely, using `delivered_file_name` and `category_subfolder` already captured on delivery records.

### Integration Points Verified

- `ClientDocumentsPage.tsx`: Uses `useSearchParams` for tab routing (line 124: `const tab = searchParams.get("tab") || "shared"`). Adding `"governance"` requires zero routing changes.
- `ClientHomePage.tsx`: Quick Links section ends at line 159. New button slots in naturally at line 153.
- `EmptyState` component (line 35-42 of `ClientDocumentsPage.tsx`): Local to the file. The new component will define its own consistent empty state.
- Styling: Client portal uses inline `hsl()` values (purple `hsl(270 55% 41%)`, cyan `hsl(189 74% 50%)`, light purple `hsl(270 20% 88%)`). The new component will match exactly.

---

## Implementation Plan

### Step 1: Create the Client Governance Register Component

**New file**: `src/components/client/ClientGovernanceRegister.tsx`

A React component that:
- Gets `activeTenantId` from `useClientTenant()`
- Uses `useQuery` to fetch `governance_document_deliveries` filtered by `tenant_id = activeTenantId` and `status = 'success'`, ordered by `delivered_at DESC`
- Enriches with version numbers from `document_versions` using the Map-based pattern (same as `GovernanceDeliveryHistory.tsx`)
- Does **NOT** query the `documents` table (blocked by RLS for client users)
- Derives document title from `delivered_file_name` (strips `.docx` extension for display), falling back to `"Document #" + document_id` when null
- Uses `category_subfolder` as category, falling back to `"Uncategorised"` when null
- Renders a table with columns:
  - **Document** (from `delivered_file_name`, cleaned)
  - **Category** (from `category_subfolder`)
  - **Version** (from `document_versions.version_number`)
  - **Delivered** (formatted date, e.g. "15 Feb 2026")
  - **Tailoring** (badge: Complete/Partial/Incomplete)
  - **View** (external link icon to `sharepoint_web_url`, opens in new tab)
- Includes a search input for filtering by document name (client-side)
- Includes a category dropdown filter populated from distinct `category_subfolder` values
- Shows an empty state ("No governance documents have been delivered yet.") matching the existing `EmptyState` pattern in `ClientDocumentsPage`
- Follows Client Portal styling (purple/pink `hsl()` inline styles)
- Is fully read-only -- zero mutations

### Step 2: Add Governance Register Tab to Client Documents Page

**File**: `src/components/client/ClientDocumentsPage.tsx`

- Import `ClientGovernanceRegister` and `ShieldCheck` from lucide-react
- Add a fourth `TabsTrigger` after the "Requests" tab (line 308):
  - Value: `"governance"`
  - Icon: `ShieldCheck`
  - Label: "Governance Register"
- Add corresponding `TabsContent` rendering `<ClientGovernanceRegister />`
- Existing tab routing via `useSearchParams` already supports any string value, so `?tab=governance` works with zero routing changes
- No changes to existing "Shared", "Uploaded", or "Requests" tabs

### Step 3: Add Governance Quick Link to Client Home Page

**File**: `src/components/client/ClientHomePage.tsx`

- Add a "Governance Register" button in the Quick Links section (after the "Resource Hub" link at line 153) linking to `/client/documents?tab=governance` with a `ShieldCheck` icon
- Consistent with the existing outline button pattern
- No count query -- avoids extra database call on every home page load

---

## What This Plan Does NOT Change

| Item | Reason |
|------|--------|
| Database schema | Zero new tables, columns, or migrations |
| RLS policies | Zero changes; existing policies sufficient |
| `documents` table | Not queried; avoids RLS gap entirely |
| Governance delivery pipeline | Untouched; register is read-only |
| SuperAdmin views | `GovernanceDeliveryHistory` and `GovernanceDeliveryDialog` unchanged |
| Existing Documents tabs | Shared, Uploaded, Requests remain identical |
| Client sidebar | No new navigation items |
| Stages 1-6 | All intact and unaffected |
| Foreign keys | No new FKs; existing FKs on `tenant_id` and `document_version_id` are read-only references |

---

## Compliance with Project Guardrails

| Guardrail | Status |
|-----------|--------|
| Compliance first | Read-only register surfaces delivered compliance documents to clients |
| Audit readiness | No mutations to audit; delivery records already audited by Stages 1-6 |
| Tenancy separation | RLS + `activeTenantId` filter; no cross-tenant data possible |
| Fixed roles | No new roles; all client users see same read-only tab |
| No scope creep | Single tab addition; no new routes or database objects |
| Atomic changes | 1 new file, 2 small edits |
| Explicit actions | Tab click to view; external link click to open SharePoint |
| Self-service | Clients can independently verify which governance documents were delivered, their version, date, and tailoring status without contacting Vivacity |
| Preview mode safe | Read-only by nature; `isReadOnly` irrelevant (no mutations) |

---

## Implementation Sequence

| Order | Task | Files | Risk |
|-------|------|-------|------|
| 1 | Create `ClientGovernanceRegister` component | New file | None |
| 2 | Add "Governance Register" tab to Documents page | 1 edit (~10 lines) | None |
| 3 | Add quick link to Client Home | 1 edit (~3 lines) | None |

---

## Summary of Changes and Impact

### Changes

1. **One new component** (`ClientGovernanceRegister.tsx`) -- read-only table with search and category filter showing delivered governance documents
2. **One tab addition** to `ClientDocumentsPage.tsx` -- "Governance Register" with ShieldCheck icon
3. **One quick link** added to `ClientHomePage.tsx` -- direct link to the new tab

### Benefits

- **Client self-service**: Tenants independently verify which governance documents were delivered, when, at what version, and tailoring status -- no need to contact Vivacity
- **SharePoint access**: Direct links to delivered documents in the client's SharePoint folder
- **Audit transparency**: Clients can verify tailoring completeness of their delivered documents
- **Zero friction**: No new pages, routes, or sidebar items; appears naturally as a tab
- **Reduced support load**: Eliminates common client queries about "which documents have been delivered"

### Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| RLS blocks `documents` table for clients | **Eliminated** | Uses `delivered_file_name` and `category_subfolder` from delivery records |
| Cross-tenant data leak | **None** | RLS restricts to own `tenant_id` via `tenant_users`; `useClientTenant()` defence-in-depth |
| Null `delivered_file_name` | **Handled** | Falls back to "Document #document_id" |
| Null `category_subfolder` | **Handled** | Falls back to "Uncategorised" |
| Impact on existing tabs | **None** | Purely additive; existing tab values unchanged |
| Database impact | **None** | Zero migrations, schema changes, or RLS changes |
| Backward compatibility | **Full** | No existing URLs, components, or data flows modified |
| Audit compliance | **Met** | Read-only view; no material actions requiring logging |
| Performance | **Low** | Query is tenant-scoped with `idx_gov_delivery_tenant` index; typical tenants have dozens of deliveries |

