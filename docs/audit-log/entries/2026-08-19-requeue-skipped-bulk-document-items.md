# Audit: 2026-08-19 — requeue_skipped_bulk_document_items + requeued_to_job_id traceability

**Trigger:** ad-hoc — following the same-day investigation into job `85e00e30`'s skipped items
(all `no_published_version`, see the counter/completion-fix entry above), Carl asked for a
mechanism to review skipped documents, publish/exclude them, and create a follow-up job for the
same client list — then, once that was built, raised that a follow-up job had no visible link
back to the items it was requeued from, creating a duplicate-work risk if two people separately
requeued the same skipped items without knowing.
**Scope:** two new/changed public RPCs, one new nullable column + partial index on
`bulk_document_job_items`, one edge function (`bulk-generate-documents-launcher`), one frontend
dialog (`SkippedDocumentsDialog` in `BulkDocumentJobProgress.tsx`). No RLS change.

## What shipped

1. **`public.requeue_skipped_bulk_document_items(p_item_ids bigint[]) returns uuid`** (new
   SECURITY DEFINER RPC, auth gate mirrors `create_bulk_document_job`/`create_targeted_bulk_document_job`:
   `auth.uid()` required, then `is_vivacity_internal_safe`). Validates every id is a real,
   currently-`skipped` item, then creates a new `bulk_document_jobs` row (`scope='selected'`,
   `origin` copied from the source job) cloning exactly the (tenant, package_instance, stage,
   document) tuples of the given items as fresh `pending` items on the new job, and kicks off the
   worker immediately (via the launcher, same pattern as `create`/`create_targeted`/`retry`). The
   new job's `error_summary` records `{requeued_from_job_ids, requeued_item_count}` for forward
   traceability.
2. **`bulk-generate-documents-launcher`**: added `action: "requeue_skipped"` — validates
   `item_ids`, calls the RPC under the caller's forwarded JWT (required, since the RPC's gate
   reads `auth.uid()`), then `kickoffWorker`s the returned job id. Deployed as v132.
3. **Frontend**: `SkippedDocumentsDialog` (new component in `BulkDocumentJobProgress.tsx`) groups
   a job's skipped items by document, shows each document's live publish status
   (`document_versions.status = 'published'`), default-checks only already-published documents,
   and creates the follow-up job via `launcherRequeueSkipped`.
4. **Traceability follow-up (same PR):** added `requeued_to_job_id uuid references
   bulk_document_jobs(id)` to `bulk_document_job_items`, set by the RPC on every source item it
   requeues (unconditionally — the RPC allows requeuing an already-requeued item again, e.g. if a
   prior follow-up job also failed, so this always reflects the *most recent* follow-up). The
   dialog now shows, per document, how many of its skipped items already have a
   `requeued_to_job_id` set ("Already requeued" / "N of M already requeued") with a link to the
   existing follow-up job, and excludes already-requeued items from the set submitted to a new
   follow-up job even if their document group is checked — checking a document can never silently
   re-requeue items someone already actioned. A document whose items are *all* already requeued
   has its checkbox disabled and defaults unchecked.

## Decisions

- Chose item-level (not job-level or document-level) traceability: `requeued_to_job_id` lives on
  `bulk_document_job_items`, not on the parent job or a separate join table, since a single skipped
  document can be requeued for some tenants but not others across different follow-up sessions —
  item-level is the only granularity that stays correct in that case.
- Deliberately excluded already-requeued items from submission rather than just warning and
  letting staff override at the per-item level — the dialog's checkbox is per-document, not
  per-item, so a per-item override would need new UI. Accepted trade-off: staff who genuinely want
  a second attempt on an item already covered by a follow-up job need to act from that job directly
  (e.g. its own retry/skip actions), not from this dialog. Revisit if that turns out to be a real
  workflow need.
- `CREATE OR REPLACE FUNCTION` was safe without a preceding `DROP FUNCTION` — the parameter list
  (`bigint[]`) and return type (`uuid`) are unchanged from the original migration; only the body
  changed. Confirmed via `pg_get_function_identity_arguments` that exactly one overload exists.
- No CI/auth-gate concern: the launcher's `requeue_skipped` branch requires the caller's forwarded
  JWT exactly like every other action in that function (no service-role path introduced).

## Verification

- Read-only SQL confirmed the RPC's auth gate and item-validation logic against production data
  before this PR (see prior session state). Frontend build (`npm run build`) passed.
- **Not re-verified live via Playwright for the traceability follow-up specifically** — the
  logged-in browser session used for the original dialog verification (grouping, publish-status
  badges, follow-up-job creation) had expired by the time the traceability column/UI was added, and
  no test credentials exist in this environment. The original dialog mechanics (grouping,
  publish-status query, job creation) were verified live earlier in the same overall work session
  against job `85e00e30`; only the new "already requeued" badge/exclusion logic added in this
  follow-up has not been separately observed live. Worth a quick manual check next time someone
  requeues a document twice.

## Open questions parked

- None new. The two open questions from the counter/completion-fix entry above (7 historical jobs
  with an unrelated `failed_count` overcount; no long-run observation yet of the eager-release
  fix) remain unaddressed and are tracked there, not here.
