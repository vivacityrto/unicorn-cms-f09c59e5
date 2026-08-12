# Audit: 2026-08-12 — Manage Documents duplicate cleanup

**Trigger:** Carl asked to clean up the "Duplicates" documents flagged in
Manage Documents (see also #242, which fixed the badge/filter itself to be
format-aware), with the heuristic that a document attached to a package
stage is the "original."
**Author:** Claude (session run by Carl)
**Scope:** Data-only cleanup, three passes — deleted 11 accidental
same-package-stage duplicates, then 26 orphaned duplicate-by-title-and-format
documents with no real usage, then consolidated 8 clusters of legitimate
cross-package/cross-stage duplicates onto a single canonical row each
(repointing `stage_documents` links and migrating `document_instances`
rather than dropping them). No RLS, trigger, or edge function changes. No
new tables.
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

## Second pass — orphaned duplicates (same day, follow-up)

After pass one, the format-aware Duplicates count (#242) dropped from 92 to
66 (32 groups). Broken down by stage-link status:

- **11 groups / 24 docs — legitimate, no action.** Each doc individually
  stage-linked to a *different* package; the system's normal shared-template
  pattern (see pass one's findings). No genuine same-`package_stages.id`
  clusters remained after pass one (verified: 0).
- **16 groups / 32 docs — one linked "original" + one orphaned sibling
  each.** Every orphan created Oct 2025–Jan 2026, before a 2026-01-13 bulk
  import created the properly stage-linked version; zero stage link, zero
  real content in either.
- **5 groups / 10 docs — fully orphaned, no original anywhere**
  (`Complaints and Appeals Form` ×4 across two format variants,
  `December Template` ×2, `Distance Learning Plan` ×2,
  `Excursion Application Form` ×2).

All 26 candidates (16 + 10) verified with zero rows across
`document_instances`, `document_versions` (beyond the initial version),
`client_stage_documents`, `generated_documents`, `governance_document_deliveries`,
`audit_inspection`, `document_files`, and `document_data_sources`.

One exception surfaced during review: **id 80**
(`Q1.D1-Industry Training Needs Survey Form`) has a `source_template_url` —
per Carl, a SharePoint link is normally a signal a document is valid even
without a stage link. Checked: it points at the *exact same* SharePoint
`sourcedoc` GUID and filename as its kept twin (id 7204, created 6 days
later in the proper bulk import) — a redundant earlier import, not a
distinct document. Carl confirmed including it in the deletion.

Carl's decision on the 10 fully-orphaned: delete all 10, including
`December Template` (a scratch/test artifact) and the three plausible-but-
unlinked real document types — accepted the small risk that a future
package might need to re-add one of those document types from scratch,
rather than keep zero-usage rows indefinitely on the chance they matter.

Result: **66 → 24** flagged documents; the remaining 24 are all legitimate
cross-package copies, not duplicates. Total `documents` row count:
598 → 561 across both passes.

---

## Third pass — consolidating the remaining 24 legitimate copies (same day, follow-up)

Carl asked to investigate whether the remaining 24 flagged documents (11
groups, all confirmed in pass two as legitimate per-package/per-stage
copies rather than accidental duplicates) could still be consolidated onto
a single canonical row per title, using a SharePoint `source_template_url`
as the signal for "intended original."

**Investigation, before any change:**
- Only **2 of 11** groups had a SharePoint link on either copy at all —
  the heuristic didn't generalize.
- **3 of 11 groups turned out not to be duplicates at all.** The
  "GTO & Apprentice Induction Checklist", "GTO Host Employer Handbook", and
  "GTO & Host Employer Induction Checklist" pairs share a generic title but
  have different `category` values (`gto-vic` vs `gto-nsw`) — genuinely
  different Victoria/NSW-specific regulatory content, not a data-quality
  issue. Left untouched; flagged separately as a possible product question
  (does a client see both state variants regardless of their actual state?)
  worth raising with Angela outside this cleanup.
- The other 8 groups had no design doc in this repo describing intended
  per-stage document requirements (a referenced "Build brief §9m" from an
  earlier PR lives outside this repo) — package/stage document assignment
  only exists as live `stage_documents` data from the original bulk import.
  With no reliable universal signal, each of the 8 remaining clusters was
  reviewed individually with Carl rather than resolved by a blanket rule.

**Mechanics — different from passes one and two.** Every prior deletion in
this cleanup removed documents no real client had ever used. These 8
clusters are the opposite: multiple packages/stages have real, currently
active client `document_instances` against *each* copy. A plain `DELETE`
would have silently dropped a real client's checklist item. Instead, each
merge:
  1. Repoints the redundant copy's `stage_documents` link to the canonical
     document.
  2. Migrates the redundant copy's `document_instances` to the canonical
     document's id (verified zero `stageinstance_id` conflicts before each
     migration, since packages have entirely disjoint client populations).
  3. Removes the now-unreferenced document row (verified zero rows in
     `document_versions` beyond the initial version, `document_files`,
     `document_data_sources`, `document_source_mappings`,
     `client_stage_documents`, `generated_documents`,
     `governance_document_deliveries`, and `audit_inspection` before each
     deletion).

This is the first time this codebase has had one `documents` row
deliberately shared across multiple packages via multiple `stage_documents`
links — every other requirement in the system still gets its own row per
package, even for identical shared content. Established here as a
supported pattern for confirmed-duplicate cleanup, not applied retroactively
elsewhere.

**Canonical selection per cluster** (default: latest id; overridden twice
where the latest id was actually the worse-maintained copy):

| Title | Kept (canonical) | Merged in | Note |
|---|---|---|---|
| ASQA Audit Report | 5558 (KS-CRI) | 5539 (DD) | latest id |
| Delivery and Assessment Plan | 6719 (KS-RTO/Mock Audit) | 1279 (KS-RTO/Strategic Business Planning) | latest id, also SharePoint-linked; 1279 had 0 instances |
| General Consultation Report | 5536 (DD) | 5519 (KS-CRI) | latest id |
| Industry Survey Form | **1286** (CHC) | 1288 (KS-RTO) | latest id (1288) was uncategorised + 0 instances; kept the categorized, actually-used copy instead |
| Q1.D3-RPL VET Student and Assessor Kit | 7582 (M-GC) | 7567 (KS-RTO) | latest id, also SharePoint-linked |
| Rectification Action Plan | 5537 (DD) | 5531, 5533 (KS-CRI ×2) | latest id, 3-way merge |
| Rectification Table of Contents | 5538 (DD) | 5422 (CHC), 5535 (KS-CRI) | latest id, 3-way merge |
| Training Needs Analysis | **1287** (CHC) | 1289 (KS-RTO) | same override as Industry Survey Form |

Each merge verified post-apply: zero rows remaining for the merged id(s) in
`documents`/`stage_documents`/`document_instances`, and the canonical row's
instance count equal to the sum of both sides' pre-merge counts (e.g.
Q1.D3-RPL VET Student and Assessor Kit: 230 + 379 = 609).

**3 groups (6 docs) intentionally left untouched**: the GTO state-variant
trio above.

Result: **24 → 6** flagged documents (exactly the 3 GTO groups). Total
`documents` row count: 561 → 551.

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

Second migration: `supabase/migrations/20260811234930_remove_orphaned_duplicate_documents.sql`

```sql
DELETE FROM documents
WHERE id IN (3,8,9,10,11,12,13,17,22,23,24,62,63,64,65,77,79,80,83,86,87,88,91,92,93,95);
```

Also applied directly to prod via Supabase MCP `apply_migration`, with
Carl's explicit approval on both the 16-orphan-sibling list and the
10-fully-orphaned list (including the id-80 SharePoint-link exception).
Verified post-apply: 24 flagged documents remain (down from 66), all
confirmed legitimate cross-package copies; total `documents` row count 561.

Third-pass migrations (one per cluster, applied and verified individually
with Carl reviewing each before execution):

- `supabase/migrations/20260812001546_merge_asqa_audit_report_duplicate.sql`
- `supabase/migrations/20260812002039_merge_delivery_assessment_plan_duplicate.sql`
- `supabase/migrations/20260812003200_merge_general_consultation_report_duplicate.sql`
- `supabase/migrations/20260812004123_merge_industry_survey_form_duplicate.sql`
- `supabase/migrations/20260812005047_merge_q1d3_rpl_kit_duplicate.sql`
- `supabase/migrations/20260812005158_merge_rectification_action_plan_duplicate.sql`
- `supabase/migrations/20260812005317_merge_rectification_table_of_contents_duplicate.sql`
- `supabase/migrations/20260812005419_merge_training_needs_analysis_duplicate.sql`

Each is a repoint-and-migrate operation, not a plain delete — see the
mechanics description above. Verified post-apply per migration (see the
cluster table above for exact before/after instance counts).

---

## Code changes (if this entry accompanies one)

- `supabase/migrations/20260811233425_remove_duplicate_stage_document_templates.sql`
  — see above.
- `supabase/migrations/20260811234930_remove_orphaned_duplicate_documents.sql`
  — see above (second pass).
- Eight `merge_*_duplicate.sql` migrations listed above — see above (third
  pass).

Branch: `chore/manage-documents-duplicate-cleanup-audit` (pass one),
`chore/manage-documents-orphan-duplicate-cleanup` (pass two),
`chore/manage-documents-cross-package-merge` (third pass).

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
  own follow-up below (since resolved in a separate PR, see
  `docs/audit-log/entries/2026-08-12-delete-document-cascade-drift-reconcile.md`).
- **Established cross-package document sharing (one row, multiple
  `stage_documents` links) as a supported pattern for confirmed-duplicate
  consolidation, not a general refactor.** Every other requirement in the
  system still gets its own row per package by default; this was applied
  only to the 8 clusters reviewed individually in the third pass.
- **Overrode the default "latest id" canonical-selection rule twice**
  (Industry Survey Form, Training Needs Analysis) where the latest id was
  an uncategorised, never-used copy and the earlier id was properly
  categorized with real client usage — picked data quality over recency in
  those two cases.
- **Left the 3 GTO-titled groups untouched entirely.** They are not
  duplicates — different `category` values (`gto-vic`/`gto-nsw`) indicate
  genuinely different state-specific content sharing a generic title.

---

## Open questions parked

- **Resolved separately:** `delete_document_cascade`'s live-vs-git drift —
  see `docs/audit-log/entries/2026-08-12-delete-document-cascade-drift-reconcile.md`.
- **Resolved in the second pass:** the fully-orphaned documents with no
  stage link at all — deleted per Carl's explicit decision.
- **Resolved in the third pass:** the 24 legitimate cross-package/
  cross-stage copies — 8 clusters (18 documents) consolidated onto a
  canonical row each; 3 clusters (6 documents, the GTO state variants) left
  untouched as genuinely different content.
- **New, unresolved:** does a client on the KS-CRI (GTO) package actually
  need to see *both* the `gto-vic` and `gto-nsw` variants of
  "GTO & Apprentice Induction Checklist" / "GTO Host Employer Handbook" /
  "GTO & Host Employer Induction Checklist" regardless of their actual
  state, or should the correct variant be selected based on the client's
  state? Not investigated further — flagged as a product question for
  Carl/Angela, outside the scope of a duplicate-data cleanup.
