# Audit: 2026-08-14 — deliver-to-clients-job-engine

**Trigger:** ad-hoc — PR 4 of the Bulk Generate / Deliver to Clients
unification stack (stacked on PR #283, #284, #285). Follows the foundation
laid in the 2026-08-14-bulk-generate-deliver-to-clients-foundation entry.
**Scope:** one new RPC (`create_document_delivery_job`) and the two edge
functions that already forward to it/the shared job engine
(`bulk-generate-documents-worker`, `bulk-generate-documents-launcher`). Did
not touch RLS policies or any table schema (all columns needed already
exist from the foundation PR).

## Findings

- `GovernanceDeliveryDialog.tsx`'s current eligibility logic is deliberately
  looser than Bulk Generate's: it never filters on
  `package_instances.is_active`/`is_complete`, only on tenant status and
  governance-folder presence, because Deliver to Clients pushes an
  already-published document version to clients who already have a
  `document_instance` for it — regardless of whether their overall
  package/stage is still in progress or already complete. The new
  `create_document_delivery_job` RPC's eligibility query was written to
  match this existing behavior exactly (queries `document_instances`
  directly, filtered only by `document_id` + tenant status), rather than
  reusing `create_bulk_document_job`'s stricter `is_active`/`is_complete`
  filters — confirmed by re-reading `GovernanceDeliveryDialog.tsx`'s
  original tenant query before writing the new RPC.

## Code changes (this entry accompanies)

- `supabase/migrations/20260814052157_create_document_delivery_job.sql`:
  new RPC, staff-gated, validates document/version/tenant existence,
  creates a `bulk_document_jobs` row with `origin = 'deliver_to_clients'`,
  resolves eligible `document_instances` for the given document + tenant
  list, and inserts `bulk_document_job_items` with the caller-supplied
  pinned `document_version_id`, per-tenant `snapshot_id` (from a jsonb map),
  and per-tenant `allow_incomplete` (from an explicit tenant-id array) —
  it does not re-derive or re-validate tailoring completeness itself; that
  gate still lives solely in `deliver-governance-document` at generation
  time.
- `supabase/functions/bulk-generate-documents-worker/index.ts`: now selects
  `origin` alongside `status` on its per-iteration job read and derives
  `force` from it (`force = origin !== 'deliver_to_clients'`) instead of
  the previous hardcoded `force: true` — Deliver to Clients jobs now
  respect `deliver-governance-document`'s own idempotency check (skip if
  already delivered for that snapshot), matching
  `GovernanceDeliveryDialog.tsx`'s pre-existing behavior; classic
  bulk-generate jobs are unaffected (still force regeneration).
- `supabase/functions/bulk-generate-documents-launcher/index.ts`: adds a
  `create_delivery` action forwarding to the new RPC, additive to the
  existing action set.
- Frontend (`GovernanceDeliveryDialog.tsx` rewritten, new
  `TenantFilterBar.tsx` shared component, `useBulkGenerateLauncher.ts` +
  `useDocumentDeliveryGuards` reused) — no schema/RLS/trigger surface,
  covered by the accompanying PR description rather than this audit entry.

Migration and both edge function redeploys were applied directly to
production via Supabase MCP tools, with explicit user confirmation
in-session, per this repo's standing Supabase deployment workflow.

## Decisions

- Chose a dedicated `create_document_delivery_job` RPC over extending
  `create_targeted_bulk_document_job` with a version/snapshot/allow_incomplete
  override path — the eligibility semantics genuinely differ (see Findings),
  and a dedicated RPC keeps that difference explicit and auditable rather
  than adding conditional branches to an already-complex existing function.

## Open questions parked

- Whether `create_bulk_document_job`/`create_targeted_bulk_document_job`'s
  stricter `is_active`/`is_complete` eligibility filter should also be
  loosened for consistency, or whether the two flows' differing semantics
  are intentional and should stay documented as such — not resolved here,
  flagged for a future conversation if it comes up.
