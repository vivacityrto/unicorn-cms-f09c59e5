

# Stage 4: Tailoring Validation & Risk Flags + Remove `documents.merge_fields`

## Overview

Two related workstreams in one implementation:
1. Add tailoring validation and risk flags to the governance delivery pipeline
2. Remove the unused `documents.merge_fields` JSONB column and all code references to it

---

## Part A: Remove `documents.merge_fields`

The column is confirmed empty across all 730+ documents. However, 11 frontend files still reference it. All references need cleanup.

### Database Migration

```sql
ALTER TABLE documents DROP COLUMN merge_fields;
```

### Code Cleanup (files referencing `documents.merge_fields` or `doc.merge_fields`)

| File | Change |
|------|--------|
| `src/components/governance/GovernanceDocumentDetail.tsx` | Remove the "Merge Fields" card (lines 174-190) that renders `doc.merge_fields`. Remove `merge_fields` from the `.select()` query (line 35). Stop passing `mergeFields` prop to `GovernanceMappingEditor`. |
| `src/components/governance/GovernanceMappingEditor.tsx` | Remove the `mergeFields` prop from the interface and any usage of it inside the component. |
| `src/pages/TenantDocuments.tsx` | Remove `merge_fields` from the `Document` interface (line 30) and the `checkAllMissingFields` logic that reads `doc.merge_fields` (lines 74-78). Instead, query `document_fields` joined to `dd_fields` to get required tags per document. |
| `src/pages/DocumentDetail.tsx` | Remove pass of `merge_fields` to `DocumentScanStatus` (line 1123). |
| `src/components/document/DocumentScanStatus.tsx` | Remove `mergeFields` prop if it came from `documents.merge_fields`. Keep any scan-result-based merge field display. |
| `src/hooks/useExcelDataSources.tsx` | Remove the line reading `data?.merge_fields` (line 313). Source from `document_fields` instead if needed. |
| `src/hooks/useStageReleases.tsx` | Remove the merge field check at lines 232-234 that reads `docData?.merge_fields`. |
| `src/components/documents/tabs/GeneratedDocumentsTab.tsx` | Remove `merge_fields` from the interface (line 30) and logic referencing it (lines 103-108). |

Note: Files in the `analyze-document` edge function and `AIAnalysisReviewDialog` use a separate `merge_fields` property on the analysis result object (not the database column). Those are unaffected.

---

## Part B: Tailoring Validation & Risk Flags

### Step 1: Database Migration

Add 4 columns to `governance_document_deliveries`:

| Column | Type | Purpose |
|--------|------|---------|
| `tailoring_completeness_pct` | `smallint` | 0-100 score at delivery time |
| `missing_merge_fields` | `jsonb` | Array of tag names the tenant was missing |
| `invalid_merge_fields` | `jsonb` | Array of raw `{{...}}` patterns not matching any `dd_fields.tag` |
| `tailoring_risk_level` | `text` | `complete`, `partial`, or `incomplete` |

### Step 2: Edge Function -- Validation in `deliver-governance-document`

Add validation logic before DOCX processing:

1. **Query required fields**: `SELECT dd.tag FROM document_fields df JOIN dd_fields dd ON dd.id = df.field_id WHERE df.document_id = X`
2. **Compare against tenant data**: Check which required tags have non-empty values in the already-fetched `v_tenant_merge_fields` data
3. **Detect invalid tags during DOCX XML processing**: While scanning XML for `{{...}}` patterns, cross-reference each cleaned tag against all `dd_fields.tag` values. Unmatched patterns are flagged as invalid (catches typos like `{{RTO name}}`, `{{ RTOname }}`, `{{ERROR}}`)
4. **Calculate risk level**:
   - `complete`: 100% required fields populated AND no invalid tags
   - `partial`: 75-99% populated, OR has invalid tags but coverage >= 75%
   - `incomplete`: below 75% populated
5. **Block if incomplete**: Return error unless `allow_incomplete: true` is in the request body
6. **Persist**: Store all 4 new columns in the delivery insert statement and include in audit log details

### Step 3: UI -- Pre-Delivery Validation in `GovernanceDeliveryDialog`

When the dialog opens:

1. Fetch the document's required tags from `document_fields` joined with `dd_fields`
2. For each eligible tenant, query `v_tenant_merge_fields` and compare against required tags
3. Show per-tenant completeness indicators next to each checkbox:
   - Green check: all required fields populated
   - Amber warning (75-99%): tooltip shows missing fields
   - Red flag (below 75%): inline list of missing fields
4. Summary banner: "X of Y tenants fully tailored. Z have missing data."
5. For selected tenants flagged `incomplete`: require "Acknowledge incomplete tailoring" checkbox before enabling Deliver button. This passes `allow_incomplete: true` to the edge function.

### Step 4: UI -- Tailoring Columns in `GovernanceDeliveryHistory`

Add to the delivery history table:

1. **Tailoring** column: colour-coded badge (`complete` green / `partial` amber / `incomplete` red)
2. **Issues** column: count with hover popover listing missing field names and invalid tags (if any)
3. Older records without tailoring data show a dash (null-safe)

### Step 5: UI -- Tailoring Health Card in `GovernanceDocumentDetail`

Add a summary card (replacing the removed merge_fields card) showing aggregate delivery stats grouped by `tailoring_risk_level`:

```text
Tailoring Health
  Fully Tailored: 12  |  Partially: 5  |  Incomplete: 3
```

Only rendered when deliveries exist for this document. Also show a "Required Fields" section sourced from `document_fields` instead of the old `merge_fields` column.

---

## Implementation Sequence

| Order | Task | Files |
|-------|------|-------|
| 1 | Database migration: drop `merge_fields` column, add 4 columns to deliveries table | Migration SQL |
| 2 | Clean up all frontend references to `documents.merge_fields` | 8 files listed in Part A |
| 3 | Add validation logic to `deliver-governance-document` edge function | `supabase/functions/deliver-governance-document/index.ts` |
| 4 | Update `GovernanceDeliveryDialog` with pre-flight validation | `src/components/governance/GovernanceDeliveryDialog.tsx` |
| 5 | Update `GovernanceDeliveryHistory` with tailoring columns | `src/components/governance/GovernanceDeliveryHistory.tsx` |
| 6 | Replace merge fields card with tailoring health card in `GovernanceDocumentDetail` | `src/components/governance/GovernanceDocumentDetail.tsx` |

---

## Technical Notes

- `document_fields` (join table with FK to `dd_fields`) is the authoritative source for required merge fields per document
- The `analyze-document` edge function's `merge_fields` property is on the analysis result object, not the database column -- it is unaffected by the column removal
- `useDocumentScan` and `useExcelBindings` reference `merge_fields` on scan results (API response), not the database column -- verify during implementation but likely unaffected
- All validation results are snapshotted at delivery time (immutable audit record)
- The `allow_incomplete` override preserves flexibility while maintaining compliance audit trail

