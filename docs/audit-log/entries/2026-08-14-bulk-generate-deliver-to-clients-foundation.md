# Audit: 2026-08-14 — bulk-generate-deliver-to-clients-foundation

**Trigger:** ad-hoc — feature request to unify "Bulk Generate" and "Deliver to
Clients" onto one job/worker engine, plus bring TGA-snapshot and
tailoring-completeness guards to Bulk Generate.
**Scope:** `bulk_document_jobs`/`bulk_document_job_items` schema and the
functions/edge functions that touch them
(`create_bulk_document_job`, `create_targeted_bulk_document_job`,
`lease_bulk_document_job_items`, `record_governance_delivery_and_mark_generated`,
`bulk-generate-documents-worker`, `deliver-governance-document`), plus
`document_activity_log` and `client_timeline_events` since this work needed a
client-visible timeline event for document delivery. Did not touch RLS
policies. Did not yet touch the Bulk Generate UI guards or the Deliver to
Clients dialog itself — those are follow-up PRs stacked on this one.

## Findings

- **Confirmed, not hypothetical: two separate silent-failure bugs** found
  while auditing `document_activity_log` and `client_timeline_events`,
  neither related to the requested feature but both fixed here since the
  migration was already touching these exact tables:
  1. `document_activity_log_activity_type_check` (from this table's original
     migration, `20260108052401`) only allows `('uploaded','downloaded')`, but
     `GovernanceDeliveryDialog.tsx` and `deliver-governance-document/index.ts`
     have shipped inserting `'governance_bulk_delivery_complete'`,
     `'governance_document_delivered'`, and `'governance_generation_failed'`
     since 2026-08-12. Every one of those inserts has been silently failing —
     confirmed via `execute_sql` that the live table is empty.
  2. `rpc_log_document_activity`'s `client_timeline_events` insert never sets
     `source`, a NOT NULL column with no default. Confirmed zero
     `'document_uploaded'`/`'document_downloaded'` rows exist despite this
     function running on every document upload/download in the app.
- **`document_shared_to_client`** has been declared in the
  `timeline_valid_event_type` CHECK constraint since a February migration but
  was never actually inserted anywhere — confirmed via repo-wide grep and a
  row-count query. Used it for the new client-visible delivery event instead
  of adding a new type.
- Bulk-generate's job-creation RPCs always inserted `NULL::uuid` for
  `document_version_id`, and the worker unconditionally resolved "latest
  published version" and hardcoded `allow_incomplete: true, force: true` —
  confirmed by reading the live `pg_proc` definitions, not the repo files
  (there was no drift, but this is why the fix targets the live functions
  directly via `apply_migration` rather than assuming the repo's last-known
  copy was current).
- **A third, previously-unaccounted-for document-generation path** was
  discovered mid-implementation: the per-stage "Generate All" button
  (`StageDocumentsSection.tsx` → `useBulkGeneration.ts` →
  `bulk-generate-phase-documents` edge function) also calls
  `deliver-governance-document` directly, with no `bulk_document_jobs` row at
  all. This is why the new correlator parameter is named generically
  `batch_id` rather than `bulk_job_id` — three independent callers share the
  same delivery pipeline, and only one of them has a real job id.

## Code changes (this entry accompanies)

- `supabase/migrations/20260814045117_bulk_generate_deliver_to_clients_foundation.sql`:
  - `bulk_document_jobs.origin` (`'bulk_generate' | 'deliver_to_clients'`,
    default `'bulk_generate'`).
  - `bulk_document_job_items.snapshot_id`, `allow_incomplete` (default
    `false`); `create_bulk_document_job`/`create_targeted_bulk_document_job`
    explicitly set `snapshot_id=NULL, allow_incomplete=true` per item,
    preserving today's Bulk Generate behavior bit-for-bit.
  - `lease_bulk_document_job_items` extended to surface the two new columns.
  - `record_governance_delivery_and_mark_generated` gains
    `p_batch_id uuid DEFAULT NULL` and now writes a client-visible
    `document_shared_to_client` timeline event
    (`source='unicorn'`, `visibility='client'`) on every successful delivery,
    regardless of caller. No dedupe key — this RPC is only reached after
    `deliver-governance-document`'s own idempotency/force gate, so every call
    here is a genuinely new delivery.
  - `document_activity_log_activity_type_check` widened to the 5 values
    actually in use.
  - `rpc_log_document_activity` fixed to supply `source='system'` on its
    timeline insert (drive-by fix, see Findings — the choice of `'system'` vs
    `'user'` can be revisited separately since it's adjacent, not requested,
    scope).
- `supabase/migrations/20260814045219_drop_stale_13arg_record_governance_delivery_overload.sql`:
  a same-session follow-up — `CREATE OR REPLACE FUNCTION` with an added
  parameter creates a new overload rather than replacing the function when
  arity changes. Confirmed both a 13-arg and 14-arg
  `record_governance_delivery_and_mark_generated` existed after the first
  migration; dropped the stale 13-arg one.
- `supabase/functions/bulk-generate-documents-worker/index.ts`: reads
  `document_version_id`/`snapshot_id`/`allow_incomplete` off the leased item
  instead of hardcoding; passes `batch_id: jobId` through to
  `deliver-governance-document`.
- `supabase/functions/deliver-governance-document/index.ts`: accepts
  `batch_id` from the request body and forwards it as `p_batch_id`.
- `src/hooks/useBulkGeneration.ts` (the per-stage "Generate All" flow): mints
  a `crypto.randomUUID()` batch id once per run when more than one document is
  planned, and passes it through so its own multi-document bursts can be
  grouped on the timeline the same way a real bulk-generate job's deliveries
  are.

Both edge functions and the migration were applied directly to production via
Supabase MCP tools, with explicit user confirmation at each step (schema
migration, then edge function deploys), per this repo's standing Supabase
deployment workflow.

## Decisions

- Generic `batch_id` naming chosen over `bulk_job_id` specifically because of
  the third-caller discovery above — flagged as a design decision worth
  recording since it wasn't part of the original plan.
- `rpc_log_document_activity`'s fix uses `source='system'`, matching the
  Academy course-publish trigger's convention for non-conversational internal
  events, rather than `'user'`. This is a judgement call on an incidental
  fix and can be revisited independently.

## Open questions parked

- Whether other `client_timeline_events` insert sites have the same
  missing-`source` bug as `rpc_log_document_activity` — not swept in this
  pass, out of scope for this feature.
- Whether `source='system'` vs `'user'` is the right choice for
  `rpc_log_document_activity`'s fixed insert.
