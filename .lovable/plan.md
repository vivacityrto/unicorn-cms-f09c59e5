# Make "Generate All" deliver to the Client Governance site, not Supabase Storage

## Supported formats

The bulk path must handle every format the single-doc path already handles:

| Format | Pipeline | Notes |
|---|---|---|
| `.docx` | docx merge-field engine in `deliver-governance-document` | Standard governance template path |
| `.xlsx` / `.xls` / `.xlsm` | xlsx merge engine (rewrites `xl/worksheets/*` + `xl/sharedStrings.xml`) | Already wired into the single-doc path |
| `.pptx` | pptx merge engine in `deliver-governance-document` (the engine we built earlier — rewrites `ppt/slides/*.xml` text runs) | Same call path; bulk simply forwards |

Anything else → tagged `unsupported_format` (counted as `skipped`, never attempted).

## Full target path

```
Site: Client Governance
  └── Documents (default doc library)
      └── Governance
          └── {RTOID} - {Legal Name}        ← "KS-{Legal Name}" if no RTO ID + active KickStart
              └── {Framework}               ← RTO / CRICOS / GTO
                  └── {Category}            ← dd_document_categories.label
                      └── <generated file>  ← .docx / .xlsx / .pptx (extension matches source template)
```

## What's already in place

The single‑document path (`deliver-governance-document`) already produces this exact structure for docx, xlsx and pptx, *provided* the tenant has been mapped through **Admin → SharePoint Folder Mapping**, which writes:

- `tenant_sharepoint_settings.governance_drive_id`
- `tenant_sharepoint_settings.governance_folder_item_id` → `Governance/{RTOID} - {Legal Name}` (or `Governance/KS-{Legal Name}`)

DB spot check confirms current usage:

| tenant_id | root_name |
|---|---|
| 44 | `41053 - Optimistic Futures Pty Ltd` |
| 7545 | `KS-Mariano Carlota` |
| 7546 | `RTO Test Tenant C` |

`deliver-governance-document` resolves framework + category subfolders under that item id and uploads with the correct content type per format.

## What `bulk-generate-phase-documents` does today (the bug surface)

- Treats every doc as Excel → silently corrupts `.docx` and `.pptx` files; forces `.xlsx` extension and `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` content type on everything.
- Uploads to bucket `package-documents/generated/{tenant_id}/{doc_id}/…` — never touches SharePoint, never honours the Client Governance path.
- Ignores `documents.is_auto_generated` (single‑doc UI requires it).
- Does not pre‑check for a mapped template document — every row is attempted.
- `audit_events.entity_id` inserted as a numeric string but column is strict `uuid` → audit insert silently fails, so the 5‑minute rate limit never trips.
- `generated_documents.stage_id = undefined`.
- Hook discards per‑row `results[]`; toast is always green.

## Plan

### 1. Re-route the bulk loop through `deliver-governance-document`

In `supabase/functions/bulk-generate-phase-documents/index.ts`:

- Keep auth, input schema, and rate‑limit guard.
- For each eligible `document_instance`, look up the latest `published` `document_versions.id` for the underlying `document_id`, then `await` an internal call to `deliver-governance-document` with `{ tenant_id, document_version_id, allow_incomplete: true, force: (mode === 'overwrite_all') }` — the same call the single-doc UI makes at `StageDocumentsSection.tsx:123`.
- Aggregate per‑row outcomes into `results[]`.

This automatically gives bulk runs the correct Client Governance placement for **docx, xlsx and pptx**, the same merge-field engines, the same `resourceLocked` retry, the same `governance_document_deliveries` audit row, and the same `tenant_activity` event.

### 2. Pre-flight check

Before the loop, verify the tenant has `governance_drive_id` + `governance_folder_item_id` configured. If not, return `400 GOVERNANCE_FOLDER_MISSING` pointing the user to **Admin → SharePoint Folder Mapping** (same wording as the single-doc path). Nothing is generated.

### 3. Eligibility filter with stable reason codes

Pre-filter `document_instances` and tag each with a reason **before** any work runs. Every row appears in `results[]`:

| Reason | Meaning |
|---|---|
| `unsupported_format` | `documents.format` not in `{docx, xlsx, xls, xlsm, pptx}` |
| `no_template` | `documents.uploaded_files` empty / null — **counted as `skipped`, never attempted** |
| `not_auto_generated` | `documents.is_auto_generated = false` |
| `already_generated` | `mode='pending_only'` and `document_instances.isgenerated = true` |
| `tailoring_incomplete` | propagated from `deliver-governance-document` (only if a future caller flips `allow_incomplete=false`) |
| `locked` | propagated from Graph `resourceLocked` after retries |
| `delivery_failed` | any other Graph/edge failure, with the underlying message |

Counters:

```
total      = eligible + ineligible
generated  = results where status='generated'
skipped    = results where status='skipped'   (no_template, already_generated, not_auto_generated, unsupported_format)
failed     = results where status='failed'    (locked, delivery_failed, tailoring_incomplete)
```

### 4. Surface per-row outcomes in the UI

In `useBulkGeneration.ts` and `StageDocumentsSection.tsx`:

- Return `results[]` from the hook (currently discarded).
- Badge each document row with `generated / skipped / failed` plus the reason ("No template", "Tailoring incomplete", "Locked in SharePoint", etc.).
- Replace the always-green "Bulk Generation Complete" toast with one that names the dominant outcome when `generated === 0` (e.g. "Nothing generated — 3 skipped (no template), 1 failed").

### 5. Fix the silent failures

- Stop inserting raw numeric strings into `audit_events.entity_id` (column is strict `uuid` per project standard). Either omit it or use a uuid for the run. This makes the existing rate limit work.
- Drop the now-dead `generated_documents` insert from this function — `governance_document_deliveries` is the canonical governance audit table and `deliver-governance-document` already writes it.

### 6. Long-run safety (deferred)

For stages with hundreds of eligible docs, return `202 Accepted` + a `bulk_run_id` and run under `EdgeRuntime.waitUntil`, with the UI polling `governance_document_deliveries` for that run. Defer until a real stage exceeds the timeout.

## What is NOT changing

- `buildClientFolderName` (the `{RTOID} - {Legal Name}` / `KS-{Legal Name}` rule) — provisioning already produces the correct folder name and `governance_folder_item_id` already points at it.
- `deliver-governance-document` — used as is for docx, xlsx and pptx.
- RLS, FKs, schema — no migration required.

## Files touched

- `supabase/functions/bulk-generate-phase-documents/index.ts` — replace inner Excel loop with per-doc `deliver-governance-document` invocation; add `no_template` + `unsupported_format` (incl. pptx allow-list) pre-filter; remove `processExcelTemplate`; fix audit insert.
- `src/hooks/useBulkGeneration.ts` — return `results[]`; honest toast.
- `src/components/client/StageDocumentsSection.tsx` — render per-row outcomes from `results[]`.

## Verification

On stage instance `24229` (tenant `6372`, package `15088`):

- Click **Generate All**. Expect:
  - 3 docs badged `Skipped: no template` (the three with empty `uploaded_files`), counted in `skipped`, never touched.
  - `Q2.D1-Student Handbook` (.docx) delivered to **Client Governance → Documents → Governance → {tenant folder} → RTO → {Category label} →** `Q2.D1-Student Handbook_…_v{n}.docx`.
  - One `governance_document_deliveries` row with `status='delivered'`.
  - One `audit_events` row with a valid uuid entity id.
  - Re-clicking within 5 minutes returns `429`.
- Pick a stage that includes a `.pptx` template → confirm the file lands in the same `{Framework}/{Category}` folder with `.pptx` extension and merge fields populated in the slides.
- Pick a non-RTO tenant with an active KickStart → confirm placement under `Client Governance/Documents/Governance/KS-{Legal Name}/…`.

## Risks

- Each delivery makes Graph calls; large bulk runs are slower but correct (mitigated by item 6).
- If a tenant's `governance_folder_item_id` was mapped to the wrong place, files land at the wrong level — same risk as today's single-doc path. Item 2's pre-flight catches the missing case.
- No RLS, FK, or schema changes.
