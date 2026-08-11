# Audit: 2026-08-12 — Manage Documents duplicate cleanup

**Trigger:** Carl asked to clean up the "Duplicates" documents flagged in
Manage Documents (see also #242, which fixed the badge/filter itself to be
format-aware), with the heuristic that a document attached to a package
stage is the "original."
**Author:** Claude (session run by Carl)
**Scope:** Data-only cleanup — deleted 11 accidental duplicate rows from
`documents`. No RLS, trigger, or edge function changes. No new tables.
**Supabase project:** hosted `unicorn-cms-f09c59e5` production project.

---

## Findings

- **The "attached to a stage" heuristic needed refinement.** This system
  deliberately stores a separate `documents` row per package for shared
  templates (e.g. "Training Needs Analysis" has its own row for CHC and
  another for KS-RTO, each with its own `stage_documents` link) — that's
  by design, not duplication. The real duplicate signal is **multiple
  document rows linked to the *same* `package_stages.id`** (verified by ID,
  not stage name text, to rule out name-collision false positives).
- **7 genuine same-stage duplicate clusters, 18 documents.** The worst case:
  `Q1.D3-RPL VET Student and Assessor Kit` had **6** identical rows (same
  title/format/import timestamp, all with no uploaded file) linked to one
  stage in KS-RTO ("Financial Viability & ASQAnet RTO").
- **This was a live client-facing bug, not just admin clutter.** Each
  duplicate `stage_documents` link generates its own `document_instances`
  row per client package. Real active clients (verified against at least
  6 distinct tenant IDs) were each carrying 6 redundant "pending" copies of
  the same document requirement on one package stage.
- **Verified safe to delete before touching anything.** Across the 18
  candidate documents' combined ~700 historical `document_instances`
  (11 active at time of check), **zero** had a non-null `generated_file_url`
  — no client had ever actually fulfilled any of the duplicate slots with
  real content. Also confirmed zero rows in `client_stage_documents`,
  `generated_documents` (`source_document_id`), `governance_document_deliveries`,
  and `audit_inspection` for every candidate — the tables with non-cascading
  foreign keys that could otherwise block deletion or need manual cleanup.
- **10 of the 18 were unambiguous** (pick the lowest/earliest-created ID per
  cluster as canonical, delete the rest). **1 cluster held for manual
  review and then explicitly resolved by Carl:**
  `TAS - Training Needs Analysis-RTOName-DDMMMYY` (ids 57, 58) — unlike
  every other duplicate, both had an uploaded file, but the files were
  mismatched photos (`Kelly Xu 2.png` and a second image) unrelated to a
  Training Needs Analysis document. Carl confirmed: keep 57, delete 58.
- **Separate, pre-existing schema drift discovered (not fixed here).** The
  live `delete_document_cascade` function (used by the Manage Documents
  "Delete" button) has diverged from git: it now includes an
  `is_vivacity_team_safe` auth check and a fix for a bug where it tried to
  delete from a non-existent `documents_tenants.document_id` column —
  neither change exists as a migration file anywhere in this repo's git
  history (`supabase/migrations/*harden_delete_document_cascade_c3*` does
  not exist locally, despite `list_migrations` showing that name applied
  2026-07-15). This cleanup didn't go through that function (a plain
  `DELETE` was safe and sufficient, see below), so it wasn't blocked by the
  drift, but the drift itself is still live and undocumented. Parked as an
  open question.

---

## DB changes shipped

Migration: `supabase/migrations/20260811233425_remove_duplicate_stage_document_templates.sql`

```sql
DELETE FROM documents
WHERE id IN (7551,7552,7553,7557,7568,7569,7570,7577,7578,6927,58);
```

Applied directly to prod via Supabase MCP `apply_migration`, with Carl's
explicit approval after reviewing the full candidate list and cluster
breakdown. A plain `DELETE` (rather than the app's `delete_document_cascade`
RPC) was used because every other table referencing `documents.id` for
these 11 rows either had zero rows (verified above) or an `ON DELETE
CASCADE` foreign key, so Postgres handled the full cascade automatically.

Verified post-apply:
- The 7 canonical "kept" documents (57, 5468, 7523, 7530, 7532, 7539, 7567)
  still present.
- Zero orphaned `stage_documents` or `document_instances` rows for any of
  the 11 deleted IDs.
- Zero of the 11 IDs remain in `documents`.

---

## Code changes (if this entry accompanies one)

- `supabase/migrations/20260811233425_remove_duplicate_stage_document_templates.sql`
  — see above.

Branch: `chore/manage-documents-duplicate-cleanup-audit`.

(Companion UI fix — making the Duplicates badge/filter format-aware — shipped
separately in #242, `hotfix/manage-documents-duplicate-format-aware`.)

---

## Decisions

- **Kept the lowest/earliest-created document ID per cluster as canonical**,
  since all rows within each cluster shared an identical `createdat`
  timestamp (bulk import) and none had any distinguishing real usage —
  arbitrary but consistent, and the choice has no practical effect since
  none of the deleted rows had ever been fulfilled by a client.
- **Did not attempt to fix the `delete_document_cascade` drift as part of
  this change.** Out of scope for a duplicate-data cleanup; flagged as its
  own follow-up below.

---

## Open questions parked

- `delete_document_cascade`'s live-vs-git drift (auth check +
  `documents_tenants` fix, applied 2026-07-15 per `list_migrations` as
  `harden_delete_document_cascade_c3`, absent from this repo) should get
  its own small hotfix PR that commits a migration matching the live
  function definition, so the app's normal "Delete" button in Manage
  Documents isn't relying on undocumented prod state.
- The 27 duplicate-by-title-and-format documents with **no** stage link at
  all (orphaned drafts, 0 instances/versions/usage anywhere) were not
  actioned this round — some of those titles have no stage-linked sibling
  under any format, so "keep the original" doesn't apply and they'd need a
  different judgement call (likely just "delete if genuinely abandoned").
- The 17 groups where the same title+format appears across *different*
  packages (each individually stage-linked) were confirmed as intentional
  per-package template copies, not duplicates — no action needed, but worth
  knowing this is the system's normal pattern if it comes up again.
