## Context

Audit of the codebase shows three of the four asks in this suggestion are already shipped on the client-facing Stage Documents drawer (`src/components/client/StageDocumentsSection.tsx`, opened at `/tenant/:tenantId` → Package → Stage → Documents):

- Name filter (`Input` with search icon).
- Category filter (`Select` populated from distinct doc categories).
- SharePoint-link indicator (`Link2` icon shown next to the title + `?` description button, driven by `documents.source_template_url` or `documents.uploaded_files`).
- Click-to-generate on the `Pending` badge (opens confirm dialog and calls `deliver-governance-document` with `force: true`).

The user confirmed that surface is done. The only outstanding piece is the **SharePoint link indicator on the Admin Package Builder's Stage Documents list** (`src/components/package-builder/StageDocumentsTab.tsx`), which lists template-level documents linked to each stage in the package definition and currently shows no indicator at all.

## Change

Add a small SharePoint link icon to each row in the Package Builder Stage Documents list, rendered immediately after the document title (same visual treatment as the client-side drawer: `Link2` icon, primary colour, wrapped in a `Tooltip` saying "Linked to SharePoint template").

## Files

1. `src/hooks/usePackageBuilder.tsx`
   - Extend the `package_stage_documents` select on line 789 to also pull `source_template_url, uploaded_files` from the joined `documents` row.
   - Extend the `StageDocument['document']` interface (lines 996-1004) with `source_template_url: string | null` and `uploaded_files: any[] | null`.

2. `src/components/package-builder/StageDocumentsTab.tsx`
   - Import `Link2` from `lucide-react` and the `Tooltip` primitives from `@/components/ui/tooltip`.
   - In `SortableDocumentRow`, after the title `<span>` (line 88), conditionally render the `Link2` icon when `doc.document.source_template_url` is set or `doc.document.uploaded_files?.length > 0`, wrapped in a tooltip. Match the styling used in `StageDocumentsSection.tsx` (`h-3.5 w-3.5 text-primary shrink-0`).
   - Optional polish: also show the icon next to each row inside the "Link Documents" picker dialog (line 483 area) so users can see at a glance which library documents already have a SharePoint template attached. Same `Link2` + tooltip pattern. (This will require pulling the same two extra columns in the picker's `availableDocuments` query.)

## Out of scope

No database migration, no edge function changes, no changes to the client-facing Stage Documents drawer or to the Documents Hub.

## Verification

After build, open `/admin/package/:id` → select a stage → Documents tab. Rows whose underlying `documents.source_template_url` is set (or that have uploaded files) show the `Link2` icon with tooltip; rows without remain unchanged. The client-facing drawer at `/tenant/:tenantId` is untouched and continues to behave as before.
