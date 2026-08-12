# Audit: 2026-08-12 — Atomic recording for governance document delivery

**Trigger:** Carl asked why some documents show as "generated" (real
SharePoint file, `document_instances.isgenerated = true`) with no matching
entry in the Governance Documents "Delivery History" panel.
**Author:** Claude (session run by Carl)
**Scope:** Hardening fix — one new DB function, one edge function updated to
call it. No RLS or trigger changes. No data changes (the historical
inconsistency this fixes was not backfilled — see Decisions).
**Supabase project:** hosted `unicorn-cms-f09c59e5` production project.

---

## Findings

- **Two unrelated causes produce "generated with no delivery record," and
  only one is a real bug.**
  1. **89% of "generated" `document_instances` rows (23,156 of 26,119)
     were never actually generated at all.** Their `generated_file_url` is
     null — stale placeholder status inherited from the original bulk data
     seed, matching the same root cause found in the "Needs Upload" badge
     investigation (`document_versions` rows with an empty `storage_path`
     satisfying an existence-only readiness check). Not a delivery bug;
     these documents have no real content and never did.
  2. **A genuine, narrow bug: 25 instances (0.8% of the 2,963 actually
     generated documents) have a real SharePoint file but no
     `governance_document_deliveries` row at all.** All 25 are the same
     document (`Q3.D1-Trainers Handbook`, id 7362 — notably *not* even a
     Governance-category document, confirming `deliver-governance-document`
     is used as the generic per-tenant document generation engine for any
     package-stage document, not just Governance ones despite its name),
     clustered in two windows: 11 May 2026 and 5–8 June 2026. Nothing since
     — `governance_document_deliveries` has 1,172 successful rows spanning
     23 Mar–10 Aug 2026, so the tracking table was already active and
     working throughout this period; this wasn't a "table didn't exist yet"
     issue.
- **Root cause of the bug:** `deliver-governance-document/index.ts`
  performed the SharePoint upload, then updated `document_instances`
  (marking it generated with the real file URL), and *then*, as a separate
  non-transactional Supabase client call, inserted the
  `governance_document_deliveries` row. If that second call failed for any
  reason after the first had already committed, the result is exactly the
  reported symptom: a document that looks fully generated with a real file,
  but with zero record it was ever delivered. Checked for a reproducible
  cause (unique constraint, FK on a since-deleted `document_version_id`) and
  found none — the exact trigger for the 25 historical failures couldn't be
  pinned down, but the code path that would produce this exact symptom was
  confirmed real and still present before this fix.
- **Live-vs-git drift check (now routine after two prior incidents this
  session):** `mcp__supabase__get_edge_function` initially showed the live
  `index.ts` and `_shared/graph-app-client.ts` differing from git. Diffed
  byte-for-byte and confirmed every difference was UTF-8 mojibake in
  comment characters (em-dashes, arrows, box-drawing characters) introduced
  by the retrieval tool's transport — not real functional drift. No
  reconciliation needed for those two files.

---

## DB changes shipped

Migration: `supabase/migrations/20260812015546_record_governance_delivery_and_mark_generated.sql`

New function `record_governance_delivery_and_mark_generated(...)` wraps
three writes in a single plpgsql function call (one implicit Postgres
transaction — if any statement raises, the whole call rolls back):
1. Insert the `governance_document_deliveries` row (`status = 'success'`).
2. Update `document_instances` for the (document_id, tenant_id) pair to
   `status = 'generated'`, `generation_status = 'generated'`,
   `generated_file_url`, `generated_item_id`, `isgenerated = true`,
   `generationdate = now()`, clearing `last_error`.
3. Resolve any open `document_generation_errors` for those instances.

Applied directly to prod via Supabase MCP `apply_migration`.

## Code changes

- `supabase/functions/deliver-governance-document/index.ts` — replaced the
  two separate calls (update `document_instances`, then insert
  `governance_document_deliveries`) with a single call to
  `record_governance_delivery_and_mark_generated` via `supabase.rpc(...)`.
  Deployed to prod via Supabase MCP `deploy_edge_function` (version 403).
- `supabase/migrations/20260812015546_record_governance_delivery_and_mark_generated.sql`
  — see above.

Branch: `hotfix/atomic-governance-delivery-recording`.

---

## Decisions

- **Did not backfill the 25 historical instances.** Their SharePoint files
  still exist and are presumably fine; retroactively inserting
  `governance_document_deliveries` rows for them would fabricate delivery
  metadata (tailoring completeness, missing/invalid merge fields at time of
  generation) that was never actually captured. Left as a known historical
  gap rather than guessed at.
- **Fixed via atomicity, not a defensive re-check.** Considered simply
  re-querying `document_instances` state before trusting it, but the root
  cause is a genuine write-ordering/atomicity gap — fixing that directly
  (one function call, one transaction) is more robust than adding
  compensating reads elsewhere.
- **Reused the existing `_shared/*` edge function dependencies unchanged**
  after confirming their only live-vs-git difference was the mojibake
  encoding artifact described above, not real drift.

---

## Open questions parked

- The two clustered incident windows (11 May 2026, 5–8 June 2026) weren't
  root-caused beyond confirming the general failure mode was possible — no
  logs were available from that far back to pin down the exact trigger for
  those 25 specific calls. If this resurfaces, the fix now in place should
  prevent the same symptom regardless of cause.
- `deliver-governance-document` is confirmed to serve as the generic
  document-generation engine for any package-stage document (not just
  Governance-category ones) via the `useBulkGeneration` stage-level
  "Bulk Generate" flow. The function/table names ("governance...") no
  longer accurately describe their actual scope — worth a rename at some
  point for clarity, not done here (out of scope for a hardening fix).
