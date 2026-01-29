
# Document Architecture Alignment Plan

## Current State Analysis

The document system is correctly structured but has no template data:

**Template Level (SuperAdmin Package Builder)**
- `package_stage_documents` table exists with correct schema
- UI (`StageDocumentsTab.tsx`) correctly links to this table
- Hook (`usePackageBuilder.tsx`) correctly reads/writes to this table
- **Problem: Table is empty (0 records)**

**Instance Level (Tenant Tracking)**
- `document_instances` table now has `stageinstance_id` column (you added this)
- This will track generated/completed documents per tenant's stage instance

## Architecture Diagram

```text
Template Level (Package Builder)
================================
[documents] (72 records - master library)
     |
     v
[package_stage_documents] (0 records - need to populate via UI)
     |-- package_id (FK to packages)
     |-- stage_id (FK to stages)  
     |-- document_id (FK to documents)
     |-- visibility, delivery_type, sort_order

Instance Level (Tenant Tracking)
================================
[document_instances] (tenant-specific)
     |-- stageinstance_id (FK to stage_instances)
     |-- document_id (FK to documents)
     |-- tenant_id
     |-- status, isgenerated, generationdate
```

## What Needs to Happen

### No Code Changes Required

The existing code is already properly wired:

1. **StageDocumentsTab.tsx** - Fetches from `documents` master library, links to `package_stage_documents`
2. **usePackageBuilder.tsx** - All CRUD operations target `package_stage_documents`
3. **Audit logging** - Already writes to `package_builder_audit_log`

### Data Population (Manual via UI)

Since `package_stage_documents` is empty, documents simply need to be linked through the Package Builder UI:

1. Navigate to a package (e.g., `/admin/package-builder/1015`)
2. Select a stage
3. Click "Link Documents" button
4. Select documents from the library
5. Documents will be inserted into `package_stage_documents`

### Future Instance Tracking

When a tenant is assigned a package and work begins on a stage, the system will need to:

1. Create entries in `document_instances` referencing:
   - The `stageinstance_id` from the tenant's active stage
   - The `document_id` from the template
   - Track generation status, completion, etc.

This instance-level logic would be implemented when building the tenant membership dashboard.

## Summary

| Component | Status | Action |
|-----------|--------|--------|
| `package_stage_documents` table | Exists, empty | Populate via UI |
| `document_instances` table | Has `stageinstance_id` | Ready for instance tracking |
| `StageDocumentsTab.tsx` | Correct | None |
| `usePackageBuilder.tsx` | Correct | None |
| Master documents library | 72 records | Available for linking |

## Recommendation

The system is ready to use. Simply link documents to stages through the Package Builder UI. The "Link Documents" button will populate `package_stage_documents` correctly.

If you want to pre-populate some document links programmatically (e.g., migrate from another source or bulk-assign), let me know and I can help with a data insertion script.
