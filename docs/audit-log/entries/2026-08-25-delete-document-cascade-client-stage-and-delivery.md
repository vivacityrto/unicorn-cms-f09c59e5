# Audit: 2026-08-25 — `delete_document_cascade` hardened for client-stage and delivery-history FKs

**Trigger:** ad-hoc — Carl reported that deleting a Manage Documents template
connected to a client's stage/package could throw a raw error, while doing a
tidy-up pass on stale documents.
**Author:** Claude (session run by Carl)
**Scope:** `delete_document_cascade` only. Did not audit other cascade RPCs.
**Supabase project:** hosted `unicorn-cms-f09c59e5` production project.

---

## Findings

- Confirmed via `pg_get_constraintdef` against `confrelid = documents`/
  `document_versions` that three FK paths into a document being deleted were
  **not** handled by the existing function and would surface a raw
  `23503`/`23502`-style error instead of a clean RPC response:
  1. `client_stage_documents.document_id` — `NOT NULL`, `NO ACTION`, no
     cascade. This is the direct "document assigned to a client's
     stage/package" link the reported bug hits.
  2. `generated_documents.source_document_id` / `.document_version_id` —
     nullable, `NO ACTION`. Blocks the cascade from `documents` →
     `document_versions` whenever a tenant has a generated file on record
     for this document.
  3. `governance_document_deliveries.document_id` / `.document_version_id` —
     both `NOT NULL`, `NO ACTION`. Live table with 9,096 rows in prod at
     time of writing — this is compliance evidence of what was delivered to
     which tenant and when.
- This is exactly the follow-up parked in
  `docs/audit-log/entries/2026-08-12-delete-document-cascade-drift-reconcile.md`
  ("Open questions parked"), plus `governance_document_deliveries`, which
  didn't exist as a table at the time of that entry.

---

## Decisions

- `client_stage_documents`: delete the row. Retiring the master document
  should remove it from any client's stage.
- `generated_documents`: `SET NULL` on both FK columns instead of deleting
  the row. Preserves the tenant's generated-file history; just decouples it
  from the (now-deleted) template/version.
- `governance_document_deliveries`: **block the delete** with a clear
  exception (`Cannot delete "<title>": it has N governance delivery
  record(s) across M tenant(s)...`) rather than deleting rows or leaving the
  raw FK error. Carl chose this over deleting delivery rows — this table is
  compliance evidence, not disposable link data. If a document with delivery
  history genuinely needs to go, that's a manual/deliberate follow-up, not
  something this RPC does silently.

---

## DB changes shipped

Migration:
`supabase/migrations/20260825050000_harden_delete_document_cascade_client_stage_and_delivery.sql`

`CREATE OR REPLACE FUNCTION public.delete_document_cascade(...)` — same
signature and return shape as before, plus:
- an early governance-delivery check that raises a friendly exception,
- explicit `client_stage_documents` cleanup,
- explicit `generated_documents` FK nulling,
- two new fields in the returned jsonb: `client_stage_docs_deleted`,
  `generated_docs_unlinked`.

Applied directly to prod via Supabase MCP `apply_migration`. Verified via
`pg_get_functiondef` immediately after that the live function matches the
migration byte-for-byte.

---

## Code changes (if this entry accompanies one)

- `supabase/migrations/20260825050000_harden_delete_document_cascade_client_stage_and_delivery.sql`
  — see above.
- `src/pages/ManageDocuments.tsx` — single-document delete success toast now
  also reports `client_stage_docs_deleted`.

Branch: `hotfix/delete-document-cascade-client-stage-and-delivery`.

---

## Open questions parked

- `handleBulkDelete` in `ManageDocuments.tsx` loops through selected
  documents sequentially and aborts the whole batch on the first error
  (pre-existing behavior, not changed here). If a bulk selection includes a
  document with governance delivery history, everything before it in the
  loop is already deleted by the time the friendly block error surfaces, and
  the toast doesn't say which document blocked it. Worth a follow-up if bulk
  delete is used often enough for this to bite.
- Did not audit other cascade-style RPCs (if any exist) for the same
  drift-vs-git pattern flagged in the 2026-08-12 entry.
