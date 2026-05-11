# Why 0 of 196 generated

The bulk run used `mode: 'pending_only'` (the default in `useBulkGeneration` and the only mode `StageDocumentsSection` ever sends). In `bulk-generate-phase-documents/index.ts` line 172, every `document_instance` with `isgenerated = true` is short-circuited with reason `already_generated` — no template fetch, no SharePoint call.

All 196 instances on stage `24229` already carry `isgenerated = true` from earlier runs (including the broken bulk runs that flipped the flag without ever delivering a file to Client Governance). So pending-only mode correctly finds nothing to do. The skip is honest; the underlying flag is just stale because previous bulk attempts marked instances generated even when delivery failed.

Two things to fix:

1. Give the user a one-click way to re-run in `overwrite_all` mode when the dominant skip reason was `already_generated`.
2. Stop the silent staleness going forward — only flip `isgenerated` after a confirmed delivery.

# Plan

## 1. Follow-up "Overwrite Previously Generated" prompt — `StageDocumentsSection.tsx`

After `bulkGenerate(...)` resolves, inspect the returned summary + `results`:

- If `summary.generated === 0` AND the dominant `skipped` reason is `already_generated` (count > 0), open a `ConfirmDialog` (variant `warning`):
  - Title: **Overwrite previously generated documents?**
  - Description: `"{N} of {total} documents are already marked generated. Overwriting will regenerate every eligible template and replace the existing files in Client Governance."`
  - Confirm label: **Overwrite All**, Cancel: **Keep Existing**
- On confirm, call `bulkGenerate({ ..., mode: 'overwrite_all' })` and `refetch()`.
- Suppress the existing "Nothing generated" toast in this specific case so the user sees the prompt instead of a dead-end toast. Implementation: have `useBulkGeneration` accept an optional `onAllAlreadyGenerated` callback, or expose a `suppressEmptyToast` flag and let the component drive the prompt.

Preferred shape: `bulkGenerate` returns `{ summary, results }` (already does via state). Component reads `results` after the await, computes `allAlreadyGenerated = summary.generated === 0 && results.every(r => r.status !== 'failed') && results.some(r => r.reason === 'already_generated')`, and opens the prompt. Add a `silent` option to the hook so we can skip the "Nothing generated" toast when we know we're about to prompt.

## 2. Initial "Generate All" dialog copy

Update the existing `AlertDialog` (lines 252–266) so the user knows up front:
- Add a checkbox **"Overwrite documents already marked generated"** that flips the call to `mode: 'overwrite_all'`.
- Update the description to: `"Up to {totalCount} documents will be processed. Already-generated documents are skipped unless you tick Overwrite."`

This means a user who knows the prior run was bad can pick overwrite without doing two round trips.

## 3. Stop the stale-flag root cause — `bulk-generate-phase-documents/index.ts`

Currently the function (and the legacy path that produced these 196 stale rows) marks `document_instances.isgenerated = true` based on attempted generation, not confirmed delivery. Change to only set `isgenerated = true` when `deliver-governance-document` returns a successful upload (HTTP 200 + `delivered: true` in the body). On any non-success outcome — `tailoring_incomplete`, `locked`, `delivery_failed`, `no_published_version`, `unsupported_format`, `no_template` — leave `isgenerated` untouched. This is the only business-logic change; it's required so future "pending_only" runs aren't blocked by ghost successes.

## 4. Verification

- Re-run on tenant `6372`, stage `24229` in pending-only mode → expect the new prompt to appear with "196 of 196 already marked generated".
- Click **Overwrite All** → expect bulk run to attempt all 196, with results split between `generated` (templates present) and `skipped: no_template` (templates absent), matching the earlier dry-run audit.
- Confirm `governance_document_deliveries` rows exist for each `generated` row and the SharePoint path is `Client Governance / Documents / Governance / {RTOID - Legal Name}/{Framework}/{Category}/`.
- Confirm a fresh stage with no prior generation still works in default pending-only mode without showing the prompt.

## Files touched

- `src/components/client/StageDocumentsSection.tsx` — checkbox in initial dialog, follow-up `ConfirmDialog`, post-run branching.
- `src/hooks/useBulkGeneration.ts` — optional `silent` flag to suppress the "Nothing generated" toast; no signature break.
- `supabase/functions/bulk-generate-phase-documents/index.ts` — only flip `isgenerated` after a confirmed delivery from `deliver-governance-document`.

No DB migration required.
