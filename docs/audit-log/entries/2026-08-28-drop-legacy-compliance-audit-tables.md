# Audit: 2026-08-28 — drop legacy compliance_audits tables

**Trigger:** ad-hoc, following same-day removal of the legacy Compliance Auditor implementation (PR #444)
**Scope:** the three legacy audit-instance tables. Did not look at `compliance_templates`/`compliance_template_sections`/`compliance_template_questions` beyond confirming they should stay — those remain live, read by the current Audits system (`useAuditWorkspace.ts`).

## Findings

- `compliance_audits`, `compliance_audit_responses`, and `compliance_corrective_actions` all had zero rows in production throughout their entire life — confirmed both before and immediately before this drop.
- Confirmed via `pg_trigger` scan: only generic `updated_at` bookkeeping triggers existed on these tables, nothing custom.
- Confirmed via `pg_proc.prosrc` scan: no Postgres function references any of the three tables by name.
- The frontend implementation that wrote to these tables (`ComplianceAuditGlobal.tsx`, `ComplianceAuditList.tsx`, `ComplianceAuditForm.tsx`, `ComplianceAuditReport.tsx`, `useComplianceAudits.tsx`, the "Compliance Auditor" sidebar link) and the `generate-audit-report` edge function that read them were both removed/retired the same day (PR #444).
- FK graph before drop: `compliance_corrective_actions` → `compliance_audits` and → `compliance_audit_responses`; `compliance_audit_responses` → `compliance_audits` and → `compliance_template_questions` (external, kept); `compliance_audits` → `tenants` (external, kept), `compliance_templates` (external, kept), `users` (external, kept).

## KB changes shipped

- No changes.

## Code changes (if this entry accompanies one)

- Migration `drop_legacy_compliance_audit_tables` applied directly to the hosted Supabase project via MCP (`apply_migration`): drops `compliance_corrective_actions`, then `compliance_audit_responses`, then `compliance_audits`, in FK-dependency order.
- Frontend/edge-function removal itself: `docs/dead-code-cleanup-plan-2026-08-27.md`, "§3 follow-up" section, and PR #444.

## Decisions

- Carl explicitly confirmed (in-session) to proceed with dropping these tables, after being told this is a schema change distinct from the earlier frontend/edge-function-only work.

## Open questions parked

- None. This closes out the legacy Compliance Auditor implementation entirely — code, edge function, and now schema.
