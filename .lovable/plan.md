Implement a toggle in `src/components/documents/SharePointTemplateBrowser.tsx` that hides SharePoint files already imported as governance document versions.

## What to build

1. Track already-imported Graph item IDs
   - Add state `importedItemIds: Set<string>`.
   - On component mount and after every successful `browse()` load, query Supabase:
     ```ts
     const { data } = await supabase
       .from('document_versions')
       .select('source_drive_item_id')
       .not('source_drive_item_id', 'is', null);
     ```
   - Build a `Set<string>` of the returned `source_drive_item_id` values.

2. Add the toggle UI
   - Add state `hideImported: boolean` defaulting to `false`.
   - Place a `<Button>` immediately next to the existing "Filter files by name..." search input, using the same pattern as `showDuplicatesOnly` in `ManageDocuments.tsx`:
     ```tsx
     <Button
       variant={hideImported ? "default" : "outline"}
       onClick={() => setHideImported((v) => !v)}
     >
       Hide already-imported
     </Button>
     ```
   - Wrap the input and button in a flex row so they sit side by side.

3. Apply the additional filter
   - Extend `filteredItems` computation so that when `hideImported` is true, non-folder items whose `id` exists in `importedItemIds` are excluded.
   - Folders remain visible regardless of the toggle.
   - The existing `filterText` name filter and folder-first sort continue to work unchanged.

## Out of scope
- No changes to selection, multi-select, or auto-navigation logic.
- No changes to the `browse()` edge-function invocation or returned data shape.
- No changes to other components.