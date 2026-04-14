

## Fix: Auto-link Compliance Templates to New Audits

### Problem
When creating a new audit, `template_id` is never set on the `client_audits` record. This causes the workspace to fall back to "freeform" mode (8 empty Standard sections with no questions), even though there are 248 template questions ready to load.

### Root Cause
`useCreateAudit` in `src/hooks/useClientAudits.ts` does not include `template_id` in the INSERT.

### Template Mapping
| Audit Type | Template ID | Template Name |
|---|---|---|
| `compliance_health_check` | `cc025000-0000-0000-0000-000000000001` | SRTO 2025 – Compliance Health Check |
| `mock_audit` | `a0025000-0000-0000-0000-000000000001` | SRTO 2025 – Mock Audit |
| `due_diligence` | `d0025000-0000-0000-0000-000000000001` | RTO Due Diligence Assessment |

### Changes

**1. `src/hooks/useClientAudits.ts`** — Add a template ID lookup map and set `template_id` on INSERT based on `audit_type`.

```typescript
const AUDIT_TYPE_TEMPLATE: Record<AuditType, string> = {
  compliance_health_check: 'cc025000-0000-0000-0000-000000000001',
  mock_audit: 'a0025000-0000-0000-0000-000000000001',
  due_diligence: 'd0025000-0000-0000-0000-000000000001',
};
```

Add `template_id: AUDIT_TYPE_TEMPLATE[input.audit_type]` to the insert object.

**2. Fix existing audit** — The audit `65df89a8-...` already has freeform sections created. Two options:
- Delete the existing `client_audit_sections` rows for this audit and PATCH `template_id` so it re-initialises with the template on next load.
- Or simply patch `template_id` and let the user delete/recreate the audit.

I will PATCH the existing audit's `template_id` and delete its empty sections so it re-initialises correctly on next page load.

**3. `src/components/audit/workspace/AuditFormTab.tsx`** — No changes needed; it already checks `audit.template_id` and branches into template vs freeform mode.

### Summary
Two-line fix in the create hook + a one-time data patch for the existing audit.

