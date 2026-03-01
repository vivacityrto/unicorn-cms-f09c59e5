
# Unified Merge Field Migration + Logo + Admin UI

## Overview

Replace the fragmented dual-system (`dd_fields` + `merge_field_definitions`) with a single authoritative source (`dd_fields`) backed by a database view (`v_tenant_merge_fields`) that resolves all merge field values per tenant. Add logo upload/display on the Tenant Detail page and a dedicated admin UI for managing merge field tags.

---

## Phase 1: Database Migration (Single SQL Migration)

### 1a. Extend `dd_fields` with source-mapping columns

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `source_table` | text | null | `tenants`, `tenant_profile`, `tenant_addresses`, `tga_rto_snapshots` |
| `source_column` | text | null | Column name or JSONB path |
| `source_address_type` | text | null | For address fields: `HO`, `DS`, `PO` |
| `is_active` | boolean | true | Enable/disable toggle |
| `description` | text | null | Human description |
| `field_type` | text | `'text'` | `text` or `image` (Logo needs special DOCX handling) |
| `created_at` | timestamptz | now() | Audit timestamp |
| `updated_at` | timestamptz | now() | Audit timestamp |

### 1b. Add `logo_path` column to `tenants`

```text
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_path text;
```

### 1c. UPDATE all 24 `dd_fields` rows with source mappings

No new rows inserted. FirstName, LastName, and Title are excluded -- AccountablePerson (mapped to `tenant_profile.primary_contact_name`) is the canonical field for the primary contact name.

| id | tag | source_table | source_column | addr_type | field_type | active |
|----|-----|-------------|---------------|-----------|------------|--------|
| 1 | Logo | tenants | logo_path | -- | image | true |
| 2 | RTOName | tenants | rto_name | -- | text | true |
| 3 | PhoneNumber | tenant_profile | phone1 | -- | text | true |
| 5 | EmailAddress | tenant_profile | rto_email | -- | text | true |
| 6 | StreetNumberName | tenant_addresses | address1 | HO | text | true |
| 7 | Suburb | tenant_addresses | suburb | HO | text | true |
| 8 | State | tenant_addresses | state | HO | text | true |
| 9 | Postcode | tenant_addresses | postcode | HO | text | true |
| 10 | Country | tenant_profile | country | -- | text | true |
| 11 | ACN | tenants | acn | -- | text | true |
| 12 | ABN | tenants | abn | -- | text | true |
| 13 | Website | tenants | website | -- | text | true |
| 14 | RTOID | tenants | rto_id | -- | text | true |
| 15 | LMS | tenants | lms | -- | text | true |
| 16 | AccountSystem | tenants | accounting_system | -- | text | true |
| 17 | TrainingFacilityAddress | tenant_addresses | full_address | DS | text | true |
| 18 | POBoxAddress | tenant_addresses | full_address | PO | text | true |
| 19 | CRICOSID | tenants | cricos_id | -- | text | true |
| 20 | LegalName | tenants | legal_name | -- | text | true |
| 21 | RegistrationEndDate | tga_rto_snapshots | endDate | -- | text | true |
| 24 | AccountablePerson | tenant_profile | primary_contact_name | -- | text | true |
| 25 | GTOName | tenant_profile | gto_name | -- | text | true |
| 26 | sms | tenants | sms | -- | text | true |

The legacy `merge_field_definitions` rows for FirstName, LastName, and Title will be left in place but ignored -- all code will query `dd_fields` only.

### 1d. Create `v_tenant_merge_fields` view

A `security_invoker = true` view returning: `tenant_id`, `field_id`, `field_tag`, `field_name`, `field_type`, `value`, `source`.

Four UNION ALL sub-queries:

1. **tenants-sourced** (Logo, RTOName, ACN, ABN, Website, RTOID, LMS, AccountSystem, CRICOSID, LegalName, sms): CROSS JOIN active `dd_fields` WHERE `source_table = 'tenants'` with `tenants`, CASE on `source_column`.
2. **tenant_profile-sourced** (PhoneNumber, EmailAddress, Country, AccountablePerson, GTOName): LEFT JOIN `tenant_profile` on `tenant_id`, CASE on `source_column`.
3. **tenant_addresses-sourced** (StreetNumberName, Suburb, State, Postcode, TrainingFacilityAddress, POBoxAddress): LEFT JOIN a CTE ranking addresses per tenant per type (`ROW_NUMBER() OVER (PARTITION BY tenant_id, address_type ORDER BY created_at DESC) = 1`). For StreetNumberName, concatenate `address1 || COALESCE(', ' || address2, '')`.
4. **tga_rto_snapshots-sourced** (RegistrationEndDate): Latest snapshot per tenant, extracting `payload->'registrations'->0->>'endDate'`.

Grant SELECT to `authenticated`.

### 1e. Storage RLS for `client-logos`

Bucket exists and is public for reads. Add INSERT/UPDATE/DELETE policies restricted to SuperAdmin or tenant admins for their own tenant folder.

---

## Phase 2: Merge Field Tags Admin UI

New page: `src/pages/admin/MergeFieldTagsAdmin.tsx` at route `/admin/merge-field-tags` (SuperAdmin only).

Features:
- Table listing all `dd_fields` rows: Tag, Name, Source Table, Source Column, Address Type, Field Type, Active status
- **Add** new tag via modal (tag code, display name, source table dropdown, source column, address type if applicable, field type, description)
- **Edit** existing tag (same modal, pre-populated)
- **Activate/Deactivate** toggle (soft-disable, preserves audit trail)
- **Delete** with confirmation (non-system fields only)
- Search and filter
- Visual badge for field type (text vs image)
- Tag code validation (no spaces, no duplicates)
- Follows existing patterns from `CodeTablesAdmin.tsx`

Add navigation link in the SuperAdmin sidebar/menu and route in `App.tsx`.

---

## Phase 3: Logo Upload + Tenant Detail Display

### 3a. New component: `src/components/tenant/TenantLogoUpload.tsx`

- Props: `tenantId`, `currentLogoPath`, `onLogoChange`
- Shows current logo from `client-logos` public URL or placeholder
- Upload button (PNG/JPG/SVG, max 2MB)
- Uploads to `client-logos/{tenant_id}/logo.{ext}`
- Updates `tenants.logo_path` on success
- Delete/replace capability
- Restricted to SuperAdmin and Team Leader roles
- Audit-logged to `client_audit_log`

### 3b. Update `src/pages/TenantDetail.tsx`

Insert logo display area inside the purple header card, below the action buttons/social icons row and above the stats grid:
- Show tenant logo image if `logo_path` is set
- Include upload/replace controls (staff only)
- Compact layout matching the header card style

---

## Phase 4: Hook Updates

### 4a. `src/hooks/useMergeFields.tsx`

- Update `MergeFieldDefinition` interface to match new `dd_fields` shape (numeric `id`, `tag`, `source_table`, `source_column`, `source_address_type`, `is_active`, `description`, `field_type`)
- Query `dd_fields` instead of `merge_field_definitions`
- Replace `getTenantMergeData(clientLegacyId)` with `getTenantMergeData(tenantId: number)` querying `v_tenant_merge_fields`
- CRUD operations target `dd_fields`

### 4b. `src/hooks/useMissingMergeFields.tsx`

- Query `dd_fields` instead of `merge_field_definitions`
- Resolve values via `v_tenant_merge_fields` instead of `clients_legacy` + `tenant_merge_data`

---

## Phase 5: Edge Function Updates

Replace merge resolution in all four functions with a single query:

```text
SELECT field_tag, field_type, value
FROM v_tenant_merge_fields
WHERE tenant_id = :tenant_id
```

Build `mergeData` as `{ [row.field_tag]: row.value }`.

For **Logo** (`field_type = 'image'`): if value is non-empty, download image from `client-logos/{value}`, inject into DOCX ZIP (`word/media/`), add relationship entry, replace `{{Logo}}` with `<w:drawing>` XML block. If empty, remove placeholder.

Files affected:
- `supabase/functions/generate-document/index.ts`
- `supabase/functions/bulk-generate-phase-documents/index.ts`
- `supabase/functions/generate-release-documents/index.ts`
- `supabase/functions/generate-excel-document/index.ts`

---

## Phase 6: UI Component Updates

- `MergeFieldHelper.tsx`: Use new `dd_fields` shape, show source info in tooltips
- `MergeFieldsEditor.tsx`: Reference `dd_fields` instead of `merge_field_definitions`

---

## Phase 7: Retirement (Non-Destructive)

- Stop all queries to `merge_field_definitions` and `tenant_merge_data`
- Leave tables in place (no DROP)
- `clients_legacy` no longer queried for merge data

---

## Files Summary

| File | Action |
|------|--------|
| Migration SQL | ALTER `dd_fields` (8 columns), UPDATE 24 rows, ALTER `tenants` (logo_path), CREATE VIEW, storage RLS |
| `src/pages/admin/MergeFieldTagsAdmin.tsx` | **New** -- CRUD admin for merge field tags |
| `src/components/tenant/TenantLogoUpload.tsx` | **New** -- logo upload/preview/delete |
| `src/pages/TenantDetail.tsx` | Add logo display in header card |
| `src/App.tsx` | Add route for `/admin/merge-field-tags` |
| `src/hooks/useMergeFields.tsx` | Repoint to `dd_fields` + view |
| `src/hooks/useMissingMergeFields.tsx` | Repoint to `dd_fields` + view |
| `src/components/package-builder/MergeFieldHelper.tsx` | Update interface/tooltips |
| `src/components/document/MergeFieldsEditor.tsx` | Update interface |
| `supabase/functions/generate-document/index.ts` | View query + Logo image injection |
| `supabase/functions/bulk-generate-phase-documents/index.ts` | View query |
| `supabase/functions/generate-release-documents/index.ts` | View query |
| `supabase/functions/generate-excel-document/index.ts` | View query (legacy fallback) |

No tables dropped. No new edge functions created. 24 canonical merge field tags. No FirstName, LastName, or Title fields.
