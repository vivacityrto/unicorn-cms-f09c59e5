

## CRICOS-Aware Audit Type Detection — Implementation Plan

### Summary
Update the New Audit modal to detect client registration type (RTO, CRICOS, or both) and dynamically show the correct audit type cards, template IDs, and CRICOS snapshot fields. Update the badge component and scheduler to handle all six audit types.

### Files to Modify

**1. `src/types/clientAudits.ts`**
- Expand `AuditType` to include `'cricos_chc' | 'rto_cricos_chc' | 'cricos_mock_audit'`
- Expand `AUDIT_TYPE_LABELS` with all 6 types
- Add `is_rto`, `is_cricos`, and CRICOS snapshot fields to `ClientAudit` interface

**2. `src/hooks/useClientAudits.ts`**
- Expand `AUDIT_TYPE_TEMPLATE` map with all 6 types (including `cricos_chc`, `rto_cricos_chc`, `cricos_mock_audit`)
- Expand `AUDIT_TYPE_HUMAN` map
- Add `is_rto`, `is_cricos`, and CRICOS snapshot fields to `CreateAuditInput`
- Pass them through in the insert mutation

**3. `src/components/audit/NewAuditModal.tsx`** — Major changes:
- Fetch `cricos_id` alongside existing tenant fields (`tenants` query adds `cricos_id`)
- Derive `registrationType` (`rto_only`, `cricos_only`, `both`) from selected tenant's `rto_id` and `cricos_id`
- Replace static `auditTypes` array with dynamic card generation based on `registrationType`:
  - `rto_only`: CHC, Mock Audit, Due Diligence
  - `cricos_only`: CRICOS CHC, Due Diligence
  - `both`: Combined CHC (recommended), RTO CHC, CRICOS CHC, Due Diligence
- Show registration indicator banner when `both`
- Step 1 shows note "Select a client first..." if no client yet; once client selected (Step 2), going back to Step 1 shows filtered cards
- Step 3: add CRICOS-specific fields (overseas student count, education agents, PRISMS users, DHA contact) shown conditionally when `is_cricos = true`
- Add TGA source note for CRICOS fields
- `handleSave` passes `is_rto`, `is_cricos`, `template_id`, and CRICOS snapshot fields

**4. `src/components/audit/AuditTypeBadge.tsx`**
- Expand `variantMap` and `AUDIT_TYPE_LABELS` usage for all 6 types
- Add CRICOS teal variant: use custom className or a new badge variant for teal styling
- Map: `cricos_chc` → teal, `rto_cricos_chc` → purple, `cricos_mock_audit` → teal

**5. `src/components/audit/AuditSchedulerSection.tsx`**
- Update `onStartCHC` to detect registration type and pass the recommended audit type
- "Start CHC" button logic: RTO-only → `compliance_health_check`, CRICOS-only → `cricos_chc`, both → `rto_cricos_chc`
- Need to fetch `cricos_id` from the scheduler data or tenant lookup

**6. `src/components/client/AuditScheduleAlert.tsx`**
- Same detection logic for the "Start CHC" button in client folder banners

### Template ID Map (all 6 types)
```
compliance_health_check  → cc025000-0000-0000-0000-000000000001
cricos_chc               → 788a5beb-93b2-48fd-a262-b313060823f4
rto_cricos_chc           → bc025000-0000-0000-0000-000000000001
mock_audit               → a0025000-0000-0000-0000-000000000001
cricos_mock_audit        → 788a5beb-93b2-48fd-a262-b313060823f4  (fallback)
due_diligence            → d0025000-0000-0000-0000-000000000001
```

### CRICOS Detection Logic
```typescript
const CRICOS_INVALID = [null, '', 'n/a', 'N/A', '-', 'TBC', 'TBA'];
const isCricos = !CRICOS_INVALID.includes(cricos_id);
const isRto = !!rto_id && rto_id !== '';
```

### No Database Migrations
All columns (`is_rto`, `is_cricos`, `snapshot_overseas_student_count`, `snapshot_education_agents`, `snapshot_prisms_users`, `snapshot_dha_contact`) and new `audit_type` values already exist in the database.

