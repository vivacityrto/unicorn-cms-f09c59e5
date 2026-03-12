

# Replace CHECK Constraints with dd_ Lookup Validation on `documents` Table

## Problem
The `documents` table has 4 hardcoded CHECK constraints that should be governed by existing/new `dd_` lookup tables:

| Column | CHECK Constraint | dd_ Table |
|---|---|---|
| `document_status` | `draft, published, archived` | `dd_document_status` ✅ exists (draft, released, superseded, archived) |
| `framework_type` | `RTO, CRICOS, GTO, NULL` | `dd_governance_framework` ✅ exists (RTO2015, RTO2025, CRICOS, GTO) |
| `ai_analysis_status` | `pending, analyzing, completed, failed, skipped` | `dd_ai_analysis_status` ❌ needs creating |
| `ai_status` | `pending, auto_approved, needs_review, rejected` | `dd_ai_status` ❌ needs creating |

**Mismatch noted**: CHECK allows `published` but `dd_document_status` has `released` instead. CHECK also lacks `superseded`. The dd_ table is the source of truth — no rows currently use `published`. CHECK allows `RTO` but dd_ has `RTO2015`/`RTO2025` — no rows currently have any `framework_type` set, so no data conflict.

## Changes

### 1. Create 2 new dd_ lookup tables

**`dd_ai_analysis_status`** — seed: pending, analyzing, completed, failed, skipped (matches current CHECK values)

**`dd_ai_status`** — seed: pending, auto_approved, needs_review, rejected (matches current CHECK values)

Both follow the standard pattern: `id, value, label, sort_order, is_active`. RLS: authenticated SELECT, SuperAdmin write.

### 2. Drop all 4 CHECK constraints

```sql
ALTER TABLE documents DROP CONSTRAINT chk_document_status;
ALTER TABLE documents DROP CONSTRAINT documents_framework_type_check;
ALTER TABLE documents DROP CONSTRAINT documents_ai_analysis_status_check;
ALTER TABLE documents DROP CONSTRAINT documents_ai_status_check;
```

### 3. Create a validation trigger

Single trigger function `trg_validate_documents_lookup_fields` that validates all 4 columns against their respective dd_ tables on INSERT/UPDATE. Only validates when the value is not null (all except `document_status` are nullable). Uses `SECURITY DEFINER` to bypass RLS on the dd_ tables.

### 4. Update `framework_type` CHECK → dd_ alignment

The CHECK allowed `RTO, CRICOS, GTO` but `dd_governance_framework` has `RTO2015, RTO2025, CRICOS, GTO`. Since no documents currently have a `framework_type` set, there's no data migration needed. The `analyze-document` edge function sets `framework_type` to `RTO | CRICOS | GTO` — this will need updating to use the dd_ values (`RTO2015`/`RTO2025`). However, since the AI analysis can't distinguish RTO2015 vs RTO2025, we should also add a plain `RTO` value to `dd_governance_framework` as a fallback for AI-assigned values, or map it in the edge function.

### 5. No frontend changes needed

The existing `dd_` tables auto-appear in Code Tables Admin. The frontend components that reference `ai_status` and `ai_analysis_status` use string comparisons — no changes needed since the values remain the same. `StageFrameworkSelector.tsx` already has its own `FRAMEWORK_OPTIONS` array which is independent.

## Impact
- **Zero data migration** — all 583 rows are `draft` (valid in dd_document_status), all AI columns are `pending` or null
- **Self-service** — SuperAdmins can add new statuses via Code Tables Admin without migrations
- **Backward compatible** — same values, just governed by lookup tables instead of hardcoded constraints
- **Edge function note** — `analyze-document` sets `framework_type` to `RTO`; needs a `RTO` row added to `dd_governance_framework` or mapping logic added

