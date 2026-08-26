# Audit: 2026-08-26 — Deliver to Clients silently completing empty jobs

**Trigger:** ad-hoc — Carl flagged two bulk-document-jobs rows in the jobs
list showing "Completed" with `0 / 0 / 0 of 0` progress, despite scope
reading "54 clients · 1 document".

**Scope:** `create_document_delivery_job` (the RPC behind the "Deliver to
Clients" flow, `GovernanceDeliveryDialog.tsx`) and its item-eligibility join.
Did not touch classic Bulk Generate (`create_bulk_document_job`) or Targeted
mode — neither showed the same pattern in the data below.

## Findings

- `create_document_delivery_job` resolves delivery items by joining
  `document_instances → stage_instances` for the selected document +
  tenants. `document_instances` rows only exist for a document that has
  actually been instantiated into a tenant via a package assignment — a
  standalone document with no package assignment (e.g. a freeform template)
  can never have any.
- When that join matched zero rows, the function still inserted the
  `bulk_document_jobs` row, then immediately set `status = 'completed'`,
  `total_items = 0`. Nothing was sent to any client, and the UI (job row,
  `GovernanceDeliveryDialog` progress view) is indistinguishable from a
  real, successfully-empty delivery — no error surfaced anywhere.
- Confirmed this is a recurring pattern, not a one-off: 6 `deliver_to_clients`
  jobs since 2026-08-14 hit `total_items = 0` this way, across two different
  staff members and five different documents (7679, 7683, 7687, 7700, 7705)
  — all five have `documents.package_id IS NULL` and zero
  `document_instances` rows. Documents that do belong to a package (7609,
  7617, 7697) created items normally.
- The two jobs that prompted this — `8e2dc685` (doc 7700, "Q4.D3-ASQA Student
  Survey Email Template") and `f91b2735` (doc 7705, "Q4.D3-Document
  Template-Portrait") — both ran by AJ Delostrico against 54 selected
  tenants, 6 minutes apart. Neither delivered anything.
- `GovernanceDocumentDetail.tsx`'s "Deliver to Clients" button was gated only
  on a published version existing, with no check for a package assignment —
  even though `GovernancePackageAssignments` (rendered lower on the same
  page) already runs the equivalent query and shows "This document has not
  been assigned to any stages or packages" when it's empty.

## Code changes (this entry accompanies)

- `create_document_delivery_job` (migration
  `create_document_delivery_job_reject_empty_matches`, applied via Supabase
  MCP): added a pre-check that raises `22023` ("No delivery targets: document
  % is not assigned (via a package) to any of the selected tenants") before
  the `INSERT` when the eligibility join would match zero rows. Because the
  whole function runs as one statement, the raised exception rolls back the
  job-row insert too — a rejected `create_delivery` call now creates nothing,
  instead of a phantom completed job.
- `GovernanceDocumentDetail.tsx`: added a `document_instances` existence
  check (`hasPackageAssignment`) and disabled the "Deliver to Clients" button
  with an explanatory tooltip when it's false, so staff can't open the dialog
  for a document that can never resolve to any delivery target.

## Decisions

- No backfill for the 6 historical empty-completed jobs — they're inert
  history rows, not currently-wrong state; left as-is.
- Did not touch classic Bulk Generate's `create_bulk_document_job` — its
  eligibility model already spans package/stage/tenant scope more broadly
  and wasn't showing this failure mode in the data reviewed.

## Open questions parked

- Whether any *other* standalone (no `package_id`) documents currently have
  a published version and are reachable from the Deliver to Clients entry
  point — not inventoried; the new button guard makes this self-limiting
  going forward, but a one-off audit of `documents where package_id is null
  and current_published_version_id is not null` was not run.
