# Audit: 2026-08-17 — internal RPC execution guards

**Trigger:** security-remediation consequence audit and production security-advisor findings.
**Scope:** `lease_bulk_document_job_items` and `rpc_resolve_validation_trigger`.

## Findings

- `lease_bulk_document_job_items` leases and mutates bulk document job items. It is used only by `bulk-generate-documents-worker`, but a later function replacement lost its original `anon`/`authenticated` revocation.
- `rpc_resolve_validation_trigger` mutates validation trigger state without verifying the caller and trusted a caller-provided `p_resolved_by` value.

## Remediation

- Restore the worker helper's direct grant revocation, including the inherited `PUBLIC` grant.
- Restrict validation-trigger resolution to verified Vivacity staff, derive the audit actor from `auth.uid()`, and revoke anonymous execution.

## Deployment verification

- Pending PR creation, production migration, and privilege/body verification.
