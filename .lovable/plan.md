# Plan: Mirror governance documents into Shared Folder / "- Governance"

Update `deliver-governance-document` to copy each generated file into the tenant's Shared Folder under a `- Governance` subtree, plus framework + category subfolders. Surface a new `SHARED_FOLDER_MISSING` pre-flight error through `bulk-generate-phase-documents` and the UI.

## 1. `supabase/functions/deliver-governance-document/index.ts`

**1a. Extend SharePoint settings fetch (line 961-965):**
Add `drive_id, shared_folder_item_id` to the select list.

**1b. Add second pre-flight after the governance check (after line 987):**
```ts
if (!spSettings?.drive_id || !spSettings?.shared_folder_item_id) {
  const errorMsg = "No shared folder configured for this tenant. Please configure the Shared Folder in Admin → Integrations → SharePoint before generating documents.";
  await supabase.from("governance_document_deliveries").insert({ /* same shape as governance block, status: "failed", error_message: errorMsg */ });
  return new Response(
    JSON.stringify({ error: errorMsg, error_code: "SHARED_FOLDER_MISSING" }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
```

**1c. Add second upload after line 1077 (`console.log("[deliver] Uploaded to SharePoint...")`), before the document_instances update:**

Wrapped in `try/catch` so failure never breaks the primary delivery:
- Resolve shared folder root via `graphGet /drives/{drive_id}/items/{shared_folder_item_id}` to compute its server-relative path.
- `ensureFolder(drive_id, sharedPath, "- Governance")` → captures itemId.
- If `doc.framework_type` set: `ensureFolder(...)` under `- Governance/<FRAMEWORK>` using same `frameworkType.toUpperCase()` logic.
- If `doc.category` set: lookup `dd_document_categories.label` (reuse the value already fetched higher up if available, otherwise re-query) and `ensureFolder(...)` for that label.
- Upload `processedBytes` with same `FOUR_MB` threshold + `graphUploadSmall` / `graphUploadSession` using the same `deliveredFileName`.
- On any error: `console.warn` and capture message into local `sharedFolderError` string. No retries (keep behaviour simple; primary upload is the source of truth).

**1d. Include warning in success response (line 1158-1170):**
Extend the existing `warnings` object with `shared_folder_error: sharedFolderError ?? null`.

Note: we do NOT create a second `governance_document_deliveries` row — the mirror is a courtesy copy. The audit record + tracked SharePoint URL remain the governance copy.

## 2. `supabase/functions/bulk-generate-phase-documents/index.ts`

Currently the pre-flight only checks the governance folder (lines 77-89). The new `SHARED_FOLDER_MISSING` error comes from per-document calls to `deliver-governance-document` inside the loop (line 228+).

**Change in the per-doc loop (around line 268):**
After parsing `respBody`, detect `respBody.error_code === 'SHARED_FOLDER_MISSING'` (or status 400 with that code) and short-circuit the whole bulk run — return immediately:
```ts
return new Response(JSON.stringify({
  success: false,
  error: respBody.error,
  error_code: 'SHARED_FOLDER_MISSING',
}), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
```
This mirrors how `GOVERNANCE_FOLDER_MISSING` is surfaced at the pre-flight; configuration errors should not be reported as per-document failures.

(Optionally also add `shared_folder_item_id` + `drive_id` to the pre-flight select+check for early failure. Including this for parity with governance check.)

## 3. `src/hooks/useBulkGeneration.ts`

Extend the existing `error_code` branch (lines 87-95) to also handle `SHARED_FOLDER_MISSING`:
```ts
if (dataBody?.error_code === 'SHARED_FOLDER_MISSING') {
  toast({
    title: 'Shared Folder Not Configured',
    description: 'Shared folder is not configured for this client. Please set it up in Admin → Integrations → SharePoint before generating documents.',
    variant: 'destructive',
  });
  return null;
}
```

## 4. `src/components/client/StageDocumentsSection.tsx`

In the single-document delivery error handler (lines 177-185 where `GOVERNANCE_FOLDER_MISSING` is handled) and the catch fallback (line 240), add a parallel `SHARED_FOLDER_MISSING` branch with the same user-facing message.

## Migration

None required. Schema already has `drive_id` and `shared_folder_item_id` on `tenant_sharepoint_settings`.

## Risk assessment

- **Backward compatible:** existing tenants with shared folder configured (the common case) work unchanged. Tenants missing shared folder get a clear actionable error instead of silent partial behaviour.
- **No RLS / FK changes.**
- **Audit safe:** primary delivery audit row + activity log unchanged; mirror copy failures only surface as a warning, never corrupt audit history.
- **Performance:** one extra Graph round-trip per generated doc (resolve path + ensure 1-3 folders + 1 upload). Acceptable; bulk is already rate-limited to 1 run / 5 min / tenant.
- **Risk: mirror upload silently failing.** Mitigated by warning surfaced in response and `console.warn` log; UI doesn't currently surface `warnings.shared_folder_error` — out of scope per the request, but worth a follow-up.
- **Risk: governance row inserted for the failed pre-flight.** Matches existing `GOVERNANCE_FOLDER_MISSING` pattern, so it's intentional.
