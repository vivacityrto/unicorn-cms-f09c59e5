

## Plan: Wire Single Document Generation to Real Pipeline

### Problem
The "Pending" click currently calls the placeholder `generate-document` edge function, which only creates a DB record — no file processing, no SharePoint upload. The real pipeline (`deliver-governance-document`) already exists and handles everything: template download, merge field replacement, branding injection, and SharePoint upload to `Client Governance > Documents > Governance > {Client Name} > {Category}`.

### What Changes

**1. `src/components/client/StageDocumentsSection.tsx` — Update `handleSingleGenerate`**

Replace the call to `generate-document` with:
- Query `document_versions` for the latest published version of the `document_id` (`status = 'published'`, ordered by `version_number desc`, limit 1)
- If no published version exists, show a toast error: "No published version available for this document"
- Call `deliver-governance-document` with `{ tenant_id, document_version_id, allow_incomplete: true }`
- Handle success response (includes SharePoint URL in `delivery.sharepoint_url`)
- Handle 422 (tailoring incomplete) with a descriptive toast
- On success, show toast with "View in SharePoint" link if available

**2. No edge function changes needed**

`deliver-governance-document` already:
- Accepts `tenant_id` as bigint (no UUID issue)
- Downloads template from master documents site (UNICORN > {Framework})
- Processes DOCX/PPTX with merge field replacement and logo injection
- Uploads to client's SharePoint folder in the correct structure
- Updates `document_instances` with `generation_status`, SharePoint item IDs
- Records delivery in `governance_document_deliveries`
- Resolves active `document_generation_errors`

**3. Update confirmation dialog text (minor)**

Add note that merge fields will be replaced with the client's current data during generation.

### Flow After Change

```text
User clicks "Pending" on document
  → Confirmation dialog (with SharePoint destination path)
  → On confirm:
      1. Query document_versions for published version
      2. If none → toast "No published version"
      3. Invoke deliver-governance-document({ tenant_id, document_version_id, allow_incomplete: true })
      4. Success → toast + refetch (document_instances already updated)
      5. 422 → toast with tailoring details
      6. Error → toast error
```

### Files Modified
- `src/components/client/StageDocumentsSection.tsx` — one function rewrite (~30 lines)

