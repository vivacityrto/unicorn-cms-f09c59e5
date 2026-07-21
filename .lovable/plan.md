# Extend Manage Documents create/edit dialog

## A. Add missing metadata fields

In `src/pages/ManageDocuments.tsx`, mirror the conventions from `src/components/governance/GovernanceDocumentEditDialog.tsx`:

1. **`formData` state** (~line 203): add `framework_type: ""`, `stage: ""`, `standard_set: ""`, `is_core: false`, `is_tenant_downloadable: false`.

2. **Lookup query**: add a new `stages` query — `.from('stages').select('id, name').order('name')` — separate from the existing `fetchStages()` (which just fetches a count for the stat card and stays untouched). Reuse the existing `dd_governance_framework` query for Framework Type.

3. **Edit pre-fill** (~line 236–250): populate the five new fields from `doc.*`, stringifying `stage`. Reset to the same defaults in the dialog-close/new-doc reset (~line 1247–1248).

4. **Metadata step JSX** (after the Category field): add — using the same Select/Switch components and layout as `GovernanceDocumentEditDialog.tsx`:
   - Framework Type — Select
   - Stage (Template Association) — single Select (not multi; deferred)
   - Standard Set Reference — text Input, placeholder `e.g. RTO2025, CRICOS2018`
   - Core Document — Switch
   - Tenant Downloadable — Switch

5. **`handleCreateDocument`**: include the five fields in both insert and update payloads. Parse `stage` as `formData.stage ? parseInt(formData.stage) : null`; treat empty strings as `null` for `framework_type` and `standard_set`.

Do not add a Document Status field — new docs keep the DB default (`'draft'`).

## B. Auto-drill into newly created document

In the create branch of `handleCreateDocument` (the `else` block), after the SharePoint import attempt finishes (success or failure — the row is kept either way), call `setSelectedDocId(newDocId)` to trigger the existing drill-down via `<GovernanceDocumentDetail />` (~line 1209). Edit path is unchanged.

## Out of scope

- Do not touch `GovernanceDocumentEditDialog.tsx`.
- Stage stays single-select; no `stage_documents`/`package_stage_documents` sync.
- No changes to the SharePoint browse step or import edge function.
- No URL param sync for the new navigation.
