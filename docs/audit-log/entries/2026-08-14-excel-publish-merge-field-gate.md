# Audit: 2026-08-14 — Excel governance templates could never be published

**Trigger:** ad-hoc (Carl reported that an Excel file with no merge fields can't be published on Manage Documents)
**Scope:** `handlePublish()` in `supabase/functions/import-sharepoint-template/index.ts` and the
`document_template_mappings` gate it enforces. Did not touch the separate, unrelated
xlsx merge-field scanner in `scan-document` (feeds Excel data-source bindings /
"release readiness", not this gate), nor any of the other Academy Builder-style
UI messaging.

## Findings

- `handlePublish` refused to publish any draft version with zero rows in
  `document_template_mappings`, with the generic error "Cannot publish without
  merge field mappings defined. Add mappings first." — no mention of file
  format.
- That table is only ever auto-populated by the import-time scan, and the scan
  explicitly only runs for `.docx`/`.pptx` (`isDocx || isPptx` in the same
  file) — Excel (`.xlsx`/`.xls`) was never scanned at all. So every freshly
  imported Excel draft started, and stayed, at zero mappings regardless of
  whether the workbook actually had any `{{tag}}` placeholders — this was a
  de facto Excel-only bug, not a real per-document requirement.
- A separate, unrelated xlsx merge-field scanner already exists
  (`scan-document`'s `scanXlsx`), but its output feeds Excel data-source
  bindings for the "release readiness" flow, not `document_template_mappings`
  — nothing bridges the two, so it doesn't help this gate.
- Merge field mapping is inherently a Word/PowerPoint concept in this
  codebase (populating placeholder text at generation time); many Excel
  governance templates (checklists, registers, trackers) legitimately have
  zero merge fields and shouldn't be blocked on that basis.

## Code changes (this entry accompanies one)

- `supabase/functions/import-sharepoint-template/index.ts` (`handlePublish`):
  skip the `document_template_mappings` count check entirely when the
  version's `file_name` ends in `.xlsx`/`.xls`. Word/PowerPoint drafts are
  unaffected — they still require at least one mapping before publishing.
- Deployed directly via `deploy_edge_function` (function has no CI-driven
  deploy path per this repo's Supabase deployment workflow); redeployed once
  more after an unrelated cosmetic slip (a doc-comment above
  `buildClientFolderName` in the shared `_shared/graph-app-client.ts` got
  shortened/misplaced during manual transcription of the bundle) — verified
  byte-for-byte against git afterward.

## Decisions

- Chose to make the gate format-aware (skip for Excel) rather than either
  building real xlsx merge-field scanning into this import path, or adding an
  explicit staff-set "no merge fields required" override flag — simplest fix
  that matches the actual product intent (merge fields are a Word/PPT
  feature), with the smallest blast radius. Discussed with Carl before
  implementing.

## Open questions parked

- If a genuine future need arises for Excel-native merge-field placeholders
  (as opposed to the existing, separate Excel data-source binding feature),
  the `scan-document` xlsx scanner would need to be wired into
  `document_template_mappings` via a new `scanXlsxMergeFields()` in the
  import path — not done here, since no current template needs it.
