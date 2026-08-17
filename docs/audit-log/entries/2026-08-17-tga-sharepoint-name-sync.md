# Audit: 2026-08-17 — TGA name sync for SharePoint folders

**Trigger:** tenant 7523 governance-folder provisioning failed.
**Scope:** tenant 7523, `tga-rto-sync`, and the shared SharePoint folder-name
helper. One tenant row was corrected; no folders or documents were changed.

## Findings

- Current TGA data for RTO 46579 is `AUSTRALIAN COMPLIANCE INSTITUTE LTD`, but
  `tenants.legal_name` retained an older `LTD.` value. Governance provisioning
  reads that tenant field, not the TGA summary.
- `tga-rto-sync` updated `tga_legal_name`, `tenant_profile`, and
  `tga_rto_summary`, but not `tenants.legal_name` or `tenants.rto_name`.
- Microsoft Graph rejected the resulting folder name because SharePoint does
  not permit a terminal period.

## Remediation

- Migration `sync_tenant_7523_tga_legal_name` aligned only tenant 7523's
  stored legal/RTO names with its existing TGA summary.
- `tga-rto-sync` now synchronizes canonical legal and RTO names for future
  per-tenant TGA syncs.
- `sanitiseFolderName` now removes terminal periods defensively.

## Deployment verification

- Production `tga-rto-sync` v612 contains the tenant-name synchronization.
- Production `verify-compliance-folder` v416 contains terminal-period
  sanitization.
- Tenant 7523 now stores the exact TGA legal name without a trailing period.

## Follow-up

- Retry Governance Folder verification for tenant 7523; it should now request
  `46579 - AUSTRALIAN COMPLIANCE INSTITUTE LTD`.
