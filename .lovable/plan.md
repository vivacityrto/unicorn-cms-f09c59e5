
# Stage 4 Enhancement: Auto-Scan Merge Fields on Template Import

## Problem

When a governance template is imported from SharePoint, the `document_fields` table is not populated. Staff must manually associate merge fields with the document. This means:
- Tailoring validation has no baseline to validate against
- Typos and invalid tags in templates go undetected until delivery time
- There's no feedback loop at import time about what the template actually contains

## Solution

After importing a DOCX template, automatically scan its XML content for `{{...}}` patterns, match them against known `dd_fields` tags, and insert valid matches into the `document_fields` table. Flag invalid/unrecognised patterns back to the user.

---

## Implementation

### 1. Add merge field scanning to `import-sharepoint-template` Edge Function

After the file is downloaded and before the response is returned, the `handleImport` function will:

1. **Check if the file is a DOCX** (by mime type or extension)
2. **Unzip and scan all XML entries** for `{{...}}` patterns using regex `/\{\{\s*([^}]+?)\s*\}\}/g`
3. **Clean each match** -- strip internal whitespace, strip any XML tag fragments (e.g., `</w:t><w:t>` splits)
4. **Look up each cleaned tag** against the `dd_fields` table (already have 23 tags)
5. **Insert matched tags** into `document_fields` using upsert (composite PK `document_id, field_id` prevents duplicates)
6. **Collect unrecognised patterns** and return them in the response as `invalid_tags[]` so the UI can warn the user

### 2. Update the response payload

The `handleImport` response will include two new fields:

```text
{
  ...existing fields...,
  detected_fields: [{ tag: "RTOName", field_id: 2 }, ...],   // successfully linked
  invalid_tags: ["RTO name", "ERROR", " RTOname "],           // unrecognised patterns
  fields_linked: 8,                                            // count added to document_fields
}
```

### 3. Update `GovernanceImportDialog` UI

After a successful import, show a summary:
- "8 merge fields detected and linked" (green)
- "3 unrecognised tags found: {{RTO name}}, {{ERROR}}, {{ RTOname }}" (amber warning)
- This gives immediate feedback without requiring a separate scan step

### 4. Handle re-imports gracefully

Since `document_fields` has a composite PK `(document_id, field_id)`, upserts naturally handle re-imports. On re-import:
- Clear existing `document_fields` rows for this `document_id` first (the new template version may have different fields)
- Re-insert based on the fresh scan
- This ensures the field list always reflects the current template content

---

## Technical Detail

### Scanning logic (added to `handleImport` in `import-sharepoint-template/index.ts`)

```text
1. Check file extension is .docx
2. Use zip.js (already available in the project) to read the DOCX
3. For each XML entry (word/document.xml, word/header*.xml, word/footer*.xml):
   a. Read as text
   b. Strip XML tags from within merge field patterns (handles Word's split-run issue)
   c. Match all {{...}} patterns
   d. Clean: trim whitespace inside braces
4. Query dd_fields for all tags (one query, ~23 rows)
5. Build map: cleaned_tag -> field_id
6. For each detected pattern:
   - If cleaned tag matches dd_fields: add to valid_fields set
   - If not: add to invalid_tags set
7. DELETE FROM document_fields WHERE document_id = X (clear old links)
8. INSERT into document_fields for each valid match
9. Return results in response
```

### XML split-run handling

Word often splits `{{RTOName}}` across multiple XML runs like:
```xml
<w:r><w:t>{{RTO</w:t></w:r><w:r><w:t>Name}}</w:t></w:r>
```

The scanner must first strip all XML tags from the text content, concatenate, then regex match. This is the same approach already used in `deliver-governance-document`'s `processDocxTemplate`.

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/import-sharepoint-template/index.ts` | Add DOCX scan logic after file download in `handleImport`, insert into `document_fields`, return detected/invalid fields |
| `src/components/governance/GovernanceImportDialog.tsx` | Show post-import field detection summary (count of linked fields + any invalid tag warnings) |

## What This Enables for Stage 4

With `document_fields` auto-populated at import time:
- The tailoring validator has an accurate baseline of what each template requires
- Invalid tags are surfaced immediately (not discovered during delivery)
- The pre-delivery completeness check in `GovernanceDeliveryDialog` works out of the box
- No manual step needed to associate merge fields with documents
