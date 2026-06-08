## Scope

Only `src/components/client/ClientGovernanceDocumentsPage.tsx` changes. No edge function, schema, or other component changes.

## Behaviour change

The existing governance documents query (metadata) stays untouched. `generated_file_url` stops being used as a link target — it is parsed only to extract the SharePoint file name via its `?file=` query parameter.

Real file URLs come from live-browsing the tenant's SharePoint `- Governance` subtree using the existing `browse-sharepoint-folder` edge function.

## Implementation steps

1. **Add a second query** (`useQuery`, keyed by `activeTenantId`, enabled when tenant is set) that returns `Record<lowercaseFileName, webUrl>`:

   a. Read `drive_id` and `shared_folder_item_id` from `tenant_sharepoint_settings` for `activeTenantId` (single row).
   b. Call `supabase.functions.invoke("browse-sharepoint-folder", { body: { action: "list", tenant_id, folder_id: shared_folder_item_id } })` to list the shared folder's children.
   c. Find the child whose `name.trim().toLowerCase() === "- governance"`. If absent, return `{}`.
   d. Recursively walk `- Governance`:
      - For each child returned by `list`: if `is_folder`, recurse with that child's `id` as `folder_id`; if file, add `{ [name.toLowerCase()]: web_url }` to the flat map.
      - Walk depth-first; sibling folder listings run in parallel via `Promise.all`; safety depth cap of 5.
   e. Return the flat map.

2. **Extract file name from `generated_file_url`** with a small helper:
   - Parse the URL, read the `file` query param (`new URL(url).searchParams.get("file")`).
   - Lowercase the result before lookup; fall back to `null` if parsing fails or the param is missing.
   - Computed in a `useMemo` from the existing query results — the metadata query function itself is unchanged.

3. **Lookup + button rewiring**:
   - For each row compute `spWebUrl = sharePointMap[extractedFileName.toLowerCase()] ?? null`.
   - **View button**:
     - If `spWebUrl`: enabled, `onClick` opens `spWebUrl` in a new tab (drop the existing `action=default → action=view` rewrite).
     - Else: render disabled with tooltip text `"File not yet available in SharePoint"`.
   - **SharePoint button**:
     - Only render if `spWebUrl` exists.
     - `onClick` calls `get-sharepoint-parent-folder` with `{ file_url: spWebUrl, tenant_id: activeTenantId }`.

4. **Loading + error UX**:
   - While the SharePoint map query is loading, render the View button disabled with a small `Loader2`; SharePoint button hidden until the map resolves.
   - If the SharePoint map query errors, treat it as "no matches" (View disabled with the "not yet available" tooltip, SharePoint hidden) and toast once.

5. **Keep**: search/filter/sort logic, the metadata query, table layout, framework/category dropdowns, permission gating — all unchanged.

## Technical notes

- Flat map keys and lookup keys are both `.toLowerCase()` to guard against any case inconsistency between DB-stored file names and SharePoint's canonical `name`.
- Recursive browse uses only the existing `action: "list"` contract; the function returns `{ items: [{ id, name, is_folder, web_url, ... }] }`.
- Query key for the SharePoint map: `["client-governance-sp-map", activeTenantId]`; `staleTime` ~5 min to avoid re-walking on every render.

## Out of scope

- Edge function changes.
- DB schema or RLS changes.
- Other governance/admin pages.
