
## Goal

Eliminate the 504 on large suites by moving the per-document loop out of the edge function into the browser, and give the user a live progress dialog. Also fix the right-hand badge so failed documents show "Failed" instead of their underlying `status`.

## Change 1 — `supabase/functions/bulk-generate-phase-documents/index.ts`

Add `plan_only?: boolean` and `record_audit?: boolean` to `BulkGenerateRequest`.

**`plan_only: true`** path (after auth + tenant access check):
- Run the SharePoint **governance folder** check → 400 `GOVERNANCE_FOLDER_MISSING` on miss.
- Run the **shared folder** check → 400 `SHARED_FOLDER_MISSING` on miss.
- Run the **rate-limit** check (still gates bulk-run frequency per tenant).
- Fetch `document_instances` for the stage + tenant.
- Build the same `skipped[]` list using the existing pre-filter (unsupported format, missing doc, `already_generated` when `mode === 'pending_only'`).
- Apply the 500-doc cap to `eligible`.
- Resolve latest published `document_version` per `document_id` (same query as today). Items with no version or no template source go into `skipped[]` with `no_published_version` / `no_template`.
- Return:
  ```json
  {
    "success": true,
    "plan": [{ "document_instance_id", "document_id", "document_version_id", "document_title" }],
    "total_eligible": N,
    "skipped": [{ "document_instance_id", "document_id", "document_title", "reason", "error" }]
  }
  ```
- Do **not** call `deliver-governance-document` and do **not** write the bulk audit row.

**`record_audit: true`** path (new, called by the hook once after the loop completes):
- Auth + tenant access only (no SharePoint / rate-limit checks).
- Insert an `audit_events` row identical in shape to today's bulk audit (`entity='bulk_generate'`, `entity_id=crypto.randomUUID()`, details include `tenant_id`, `stageinstance_id`, `package_id`, `mode`, `total`, `generated`, `skipped`, `failed`, `results`) using the `results` array provided in the request body.
- Return `{ success: true }`.
- Preserves the existing project-rule "audit readiness by default" — the per-doc deliveries are still audited inside `deliver-governance-document`; this row remains the bulk-run summary.

**Legacy path** (neither flag set) is left intact for backward compatibility — any caller that still posts a plain payload gets the current behaviour. We will simply stop using it from the hook.

## Change 2 — `src/hooks/useBulkGeneration.ts`

Restructure to two-phase flow:

State:
- `generating: boolean`
- `progress: { total, generated, skipped, failed } | null` (kept; updated live)
- `liveResults: LiveResult[]` where `LiveResult = BulkResult & { status: 'pending' | 'generating' | 'generated' | 'skipped' | 'failed' }`
- `currentDoc: string | null`
- `completedCount: number` (derived getter or stored)
- `cancelledRef = useRef(false)`

Flow inside `bulkGenerate(...)`:

1. **Plan phase** — `invoke('bulk-generate-phase-documents', { ..., plan_only: true })`. Surface `GOVERNANCE_FOLDER_MISSING` / `SHARED_FOLDER_MISSING` toasts (existing logic) and bail. Seed `liveResults` with:
   - one `pending` entry per planned doc (in plan order)
   - then append every entry from `skipped[]` already finalised as `skipped`
2. **Execute phase** — for each planned item, sequentially:
   - if `cancelledRef.current`, break
   - set `currentDoc = item.document_title`, mark that entry `generating`
   - `invoke('deliver-governance-document', { tenant_id, document_version_id, allow_incomplete: true, force: mode === 'overwrite_all' })`
   - Map the response → `generated` / `failed` / `skipped` using the same status/reason mapping the edge function uses today (`tailoring_incomplete` on 422 with `tailoring`, `locked` if error matches `/lock|423|resourceLocked/i`, else `delivery_failed`; `delivered` on success; treat `response.data?.skipped` as `already_generated`).
   - On `error_code === 'GOVERNANCE_FOLDER_MISSING' | 'SHARED_FOLDER_MISSING'` → abort the whole loop, toast (same wording as today), and stop.
   - After each step recompute `progress` from `liveResults` and bump `completedCount`.
3. **Cancel handling** — `cancelGeneration()` sets `cancelledRef.current = true`. Any item still `pending` after the loop exits is flipped to `skipped` with reason `'cancelled'` (new `BulkResultReason` value).
4. **Stuck-state guard** — `finally` block: any `LiveResult` still `generating` is flipped to `failed` with reason `'delivery_failed'` and `error: 'cancelled' | 'unknown_error'` (cancelled if `cancelledRef`, else unknown). Guarantees no orphan spinners.
5. **Audit** — after the loop (success, cancel, or error) fire-and-forget `invoke('bulk-generate-phase-documents', { tenant_id, stageinstance_id, package_id, mode, record_audit: true, total, generated, skipped, failed, results })`. Failure to record is logged but does not affect the UI.
6. **Toast** — keep the existing end-of-run summary toasts (nothing/partial/complete) so `handleBulkGenerate` callers behave the same.

Public surface (replaces today's `{ bulkGenerate, generating, progress, results }`):
```ts
return { bulkGenerate, generating, progress, liveResults, currentDoc, completedCount, cancelGeneration };
```

`bulkGenerate` still returns `{ summary, results }` so the existing "all already generated → prompt overwrite" branch in `StageDocumentsSection` keeps working.

Add new reason to the type/label maps:
```
cancelled: 'cancelled by user'
```

## Change 3 — `src/components/client/BulkGenerationProgressDialog.tsx` (new)

Modal `Dialog` (`@/components/ui/dialog`) controlled by `open={generating || (liveResults.length > 0 && !dismissed)}`. The dialog is non-dismissable while `generating` (override `onOpenChange` to no-op until done). When done, header `X` and a `Close` button are enabled.

Props:
```ts
{
  generating: boolean;
  progress: BulkGenerationProgress | null;
  liveResults: LiveResult[];
  currentDoc: string | null;
  completedCount: number;
  totalCount: number;
  onCancel: () => void;
  onClose: () => void;
}
```

Body:
- Header: "Generating Documents"
- `<Progress value={(completedCount/totalCount)*100} />` + text `"{completedCount} of {totalCount}"`.
- Subline (hidden when done): `"Currently generating: {currentDoc}"`.
- Scrollable list (`ScrollArea`, max-h ~50vh) of `liveResults` rows. Each row:
  - icon by `status`:
    - `generated` → `CheckCircle2` text-green-600
    - `generating` → `Loader2` text-blue-600 animate-spin
    - `failed` → `XCircle` text-destructive
    - `skipped` → `Minus` text-muted-foreground
    - `pending` → `Clock` text-muted-foreground (whole row opacity-60)
  - title (left), label (right): `Generated` / `Generating…` / `Failed` / `Skipped` / `Pending`
  - failed/skipped rows show `error || REASON_LABEL[reason]` underneath in muted destructive text
- Auto-scroll: a `useEffect` that runs when `currentDoc` changes — scroll the corresponding row's ref into view (`block: 'nearest'`).
- Footer:
  - while running: `[Cancel]` (calls `onCancel`)
  - when done: summary `"{generated} generated, {skipped} skipped, {failed} failed"` + `[Close]`

## Change 4 — `src/components/client/StageDocumentsSection.tsx`

- `const { bulkGenerate, generating, progress, liveResults, currentDoc, completedCount, cancelGeneration } = useBulkGeneration();`
- Add `const [progressOpen, setProgressOpen] = useState(false);` and set it `true` inside `handleBulkGenerate`/`handleOverwriteConfirm` before invoking `bulkGenerate`. Auto-clears when user clicks Close.
- Render `<BulkGenerationProgressDialog generating={generating} progress={progress} liveResults={liveResults} currentDoc={currentDoc} completedCount={completedCount} totalCount={liveResults.length} onCancel={cancelGeneration} onClose={() => setProgressOpen(false)} />` (gate on `progressOpen`).
- Delete the inline progress banner at lines 395–411 (the `{generating && ...}` and `{progress && !generating && ...}` blocks).
- Keep the "Generate All" `AlertDialog`, the overwrite prompt, merge-warnings dialog, and all single-doc generation logic untouched.

## Change 5 — Failed badge fix (same file, around line 590–649)

In the right-hand badge cell:
- If `doc.generation_status === 'failed'`, render a `Badge variant="destructive"` with label "Failed" **before** any of the other branches (`isGeneratingSingle`, `canGenerate && !has_sharepoint_link`, `canGenerate`, default). The `RefreshCw` retry button stays as-is.
- Wrap that destructive badge in the existing `Tooltip` (already used for `errorInfo` on line 578) when `doc.last_error` is present: tooltip shows `errorInfo.label` heading + the raw `doc.last_error` (truncate-friendly via `max-w-[280px] whitespace-pre-wrap`). When `last_error` is null, render the badge without a tooltip.

This is purely presentational — left-side icon already correct via `GENERATION_STATUS_CONFIG.failed`.

## Audit / Compliance check

- **Audit row preserved**: `record_audit: true` writes the same `audit_events` row shape as today, populated from the frontend-collected results. Per-document delivery audits already exist inside `deliver-governance-document`. No regression to "audit readiness by default".
- **Tenant access**: `plan_only` and `record_audit` re-run the same `users.unicorn_role` / `tenant_users` access check the function already enforces.
- **Rate limit**: still enforced on `plan_only` (the run-initiating call); skipped on `record_audit` (post-hoc bookkeeping). This matches the intent — one bulk run per tenant per 5 min.
- **Backward compatibility**: legacy callers without either flag get the legacy behaviour unchanged; this matters because no other code reads/writes the bulk endpoint, but keeping the path avoids breaking any historical retry tooling.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Per-doc `invoke` is slower wall-clock than parallel server-side calls would be | High | Low | Acceptable — sequential matches today's loop ordering and avoids SharePoint throttling; live UI hides perceived latency |
| User closes browser mid-loop → partial state | Medium | Medium | `deliver-governance-document` writes its own audit + status per doc; next page load reflects truth. Stuck-state guard prevents orphan `generating` in our in-memory `liveResults` (not in DB). |
| Cancel races with an in-flight delivery | Medium | Low | We wait for the current invoke to settle before exiting the loop (per spec) — no abort signal sent to the edge function |
| Audit row missing if `record_audit` fails | Low | Low | Fire-and-forget with `console.error`; per-doc audits still exist. Optional retry could be added later. |
| Failed badge tooltip leaks long stack traces | Low | Low | `max-w-[280px] whitespace-pre-wrap` clamps width; `last_error` already user-friendly in current data |
| Plan-only returns 0 eligible — UI still opens empty dialog | Low | Low | Hook short-circuits before opening dialog: only `setProgressOpen(true)` after plan returns ≥1 planned doc OR skipped entries to show; if total is 0, fall through to existing "Nothing to generate" toast |

## Summary of Benefits

- No more 504s on suites with >40 docs — each `deliver-governance-document` call gets its own request lifetime.
- Live, scannable progress dialog with per-doc status, error reasons inline, and cancel support.
- Failed documents now show "Failed" in both columns; hovering reveals the actual error, dramatically improving triage without leaving the page.
- Audit trail and rate-limit behaviour preserved.
- Legacy bulk-endpoint payload still works → zero blast radius for unknown callers.
