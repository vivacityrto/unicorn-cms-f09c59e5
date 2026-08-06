# Audit: 2026-04-29 — audit-documents-open-view

**Trigger:** ad-hoc — Angela requested evidence files be openable by both Consultant and Tenant
**Scope:** `audit-documents` Supabase storage bucket RLS policies; `DocumentsTab.tsx` `DocumentCard` component. Did not touch other buckets, other components, or any table-level RLS.

## Findings

- `DocumentCard` in `src/components/audit/workspace/DocumentsTab.tsx` had no open/view affordance — only delete and expand buttons. Users had no way to open uploaded evidence files from the UI.
- `audit_docs_select` RLS policy already covers both Vivacity team (`is_vivacity_team_safe(auth.uid())`) and tenant users (`has_tenant_access_safe((foldername(name))[1]::bigint, auth.uid())`) — no migration or policy change was required.
- `audit_docs_insert` and `audit_docs_delete` are Vivacity-team-only. Tenants can view but not upload via the Documents tab. Flagged to Angela; accepted as intentional for the current due-diligence workflow.
- File path format in bucket is `{auditId}/{UUID}_{filename}`. The first folder segment (auditId) is used in the tenant access check — consistent with `has_tenant_access_safe` expecting a tenant-scoped identifier cast to bigint.

## KB changes shipped

- No changes.

## Codebase observations (read-only)

- unicorn-cms @ 94a5219c: `DocumentsTab.tsx` `DocumentCard` — delete button only, no view/open. Lovable prompt issued this session to add `handleOpen` (signed URL, 3600s TTL), make `<Card>` clickable with `cursor-pointer hover:shadow-md`, add `stopPropagation` on expand button, delete button, and AI results panel wrapper. No imports added (all already present). No schema, migration, or hook changes.

## Decisions

- No ADRs drafted or resolved.
- Tenant upload capability via Documents tab is Vivacity-team-only (INSERT policy) — accepted, not changed.

## Open questions parked

- If tenants are ever expected to upload their own evidence through this tab, `audit_docs_insert` will need a policy addition matching the pattern of `audit_docs_select`. Not actioned — needs product decision.

## Tag

audit-2026-04-29-audit-documents-open-view
