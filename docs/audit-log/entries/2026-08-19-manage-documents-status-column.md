# Audit: 2026-08-19 — Manage Documents "Client Doc" column replaced with real publish/delivery status

**Trigger:** Carl asked how the "Client Doc" column on Manage Documents actually works.
**Scope:** `get_document_delivery_summary` RPC (new), `src/pages/ManageDocuments.tsx`. No RLS
change on the underlying `governance_document_deliveries` table — the new RPC mirrors its
existing SELECT policy rather than widening access.

## Findings

**`documents.isclientdoc` and `documents.is_released` are both dead weight on the master
template document list.** Live query across all 612 documents: `is_released` is `false` on
every single row, no exceptions, ever. `isclientdoc` is `true` on 431/612, but nothing anywhere
in the codebase branches on its value downstream (checked `ClientDocumentsTab.tsx`,
`GeneratedDocumentsTab.tsx`, `TenantDocuments.tsx`, `TenantDocumentDetail.tsx`, and every RLS
policy/SQL function — grep across `supabase/` returns only the column's original creation
migration and one legacy `unicorn1.documents` data-migration copy, no behavioral use).
`ManageDocuments.tsx` itself has no UI control that can ever set `isclientdoc` to `true` — three
*other* dialogs (`CreateDocumentDialog2.tsx`, `AdminManagePackages.tsx`, `AddDocumentDialog.tsx`,
`BulkUploadDialog.tsx`) can, with inconsistent, never-reconciled meanings ("released to client"
vs. "is a client document" vs. hard-coded `true` for uploads). Both fields trace back to a
mostly-abandoned ~25-document `package_id`-scoped upload flow, distinct from the stage/
`document_stage_links`/`document_versions` model the ~587 master template documents actually use.

## Fix

Replaced the "Client Doc" (Yes/No) column with a "Status" column showing two real signals:

1. **Publish status of the current version** — reuses the same `getCurrentVersion` (highest
   `version_number`) logic from the 2026-08-19 Publish Status filter fix: Published / Draft / No
   version.
2. **Delivery history** — "Delivered ×N" (N = distinct tenants successfully delivered to, via
   `governance_document_deliveries`) or "Not delivered", with a tooltip showing the last delivery
   date.

**Bug caught during implementation, before merge:** the first version of (2) queried
`governance_document_deliveries` directly from the client with `.select(...).eq('status',
'success').in('document_id', docIds)` — the exact same PostgREST-default-1000-row-cap class of
bug already fixed once this session in `BulkDocumentJobProgress.tsx`. Live-verified: this table
already holds more than 1000 successful-delivery rows, and a manual reproduction confirmed the
naive query returned exactly 1000 rows with document 7625's (very recently delivered) rows
missing from that set — so it silently showed "Not delivered" on a document that had, in fact,
just been delivered to 4 tenants moments earlier via job 85e00e30.

Fixed by moving the aggregation server-side: `get_document_delivery_summary(p_document_ids
bigint[])` returns one row per document (`document_id`, `delivered_tenant_count`,
`last_delivered_at`), grouping/counting in Postgres rather than transferring every raw delivery
row to the browser to count client-side. This avoids the row-cap class of bug entirely (the
result set is bounded by document count, not delivery-row count) and scales as
`governance_document_deliveries` keeps growing.

## Decisions

- Removed the dead `clientDocs` count variable (computed from `isclientdoc` but never rendered
  anywhere in `ManageDocuments.tsx`) as part of this change. Left `isclientdoc`/`is_released`
  themselves, and the other dialogs that can set them, untouched — those belong to a separate,
  still-open question about the legacy per-tenant upload flow, not this session's scope.
- The new RPC's auth gate (`is_vivacity_internal_safe`) mirrors, rather than replaces, the
  existing RLS policy on `governance_document_deliveries` (`is_vivacity_team_safe(auth.uid())
  OR tenant membership`) — scoped to staff-only since `ManageDocuments.tsx` is a staff-only page
  that never needs the tenant-membership branch.
- Went through two migrations (`get_document_delivery_summary` → `document_delivery_summary_rename`)
  rather than one clean function: the first pass used a `_secure` suffix to distinguish it from an
  interim unguarded helper while iterating, then renamed to drop that suffix for consistency with
  every other staff-gated RPC in this codebase (none use a `_secure` suffix). Both migrations are
  committed as applied, matching this session's established practice of keeping local migration
  files byte-consistent with what actually ran, rather than squashing history.

## Open questions parked

- Whether `isclientdoc`/`is_released` and the ~25-document legacy per-tenant upload flow
  (`CreateDocumentDialog2`, `AddDocumentDialog`, `BulkUploadDialog`, `ClientDocumentsTab`,
  `TenantDetail`'s "Recent Documents" widget) should be cleaned up, consolidated, or removed
  entirely is unresolved — flagged to Carl, not touched this session.
