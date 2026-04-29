## Plan

Extend the `AUDIT_TYPE_LABELS` record in `supabase/functions/research-audit-intelligence/index.ts` (lines 26–32) to include the 7 current `AuditType` values alongside the 5 existing legacy ASQA keys.

### Change (single file)

Replace lines 26–32 with:

```ts
const AUDIT_TYPE_LABELS: Record<string, string> = {
  // Legacy ASQA types (unchanged)
  initial_registration: "Initial Registration",
  re_registration: "Re-registration",
  extension_to_scope: "Extension to Scope",
  strategic_review: "Strategic Compliance Review",
  post_audit_response: "Post-Audit Rectification",
  // Current AuditType values
  compliance_health_check: "CHC",
  cricos_chc: "CHC — CRICOS",
  rto_cricos_chc: "CHC — RTO + CRICOS",
  mock_audit: "Mock Audit",
  cricos_mock_audit: "Mock Audit — CRICOS",
  due_diligence: "Due Diligence",
  due_diligence_combined: "Combined RTO + CRICOS Due Diligence",
};
```

### Out of scope
- No changes to fallback logic at line 108 (`AUDIT_TYPE_LABELS[audit_type] || audit_type` remains intact).
- No new branching on `audit_type`.
- No imports from `src/` (edge function isolation preserved).
- No other files, schemas, RLS policies, or migrations touched.
- All 5 existing legacy keys remain byte-identical.

Approve to apply.