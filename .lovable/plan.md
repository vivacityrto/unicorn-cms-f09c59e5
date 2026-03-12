

# Clickable SharePoint URL Indicator

## What changes

**`src/pages/admin/GovernanceDocuments.tsx`**

1. **Import** `useAuth`, `SharePointLinkDialog`, and `LinkIcon` / `Unlink` icons from lucide-react
2. **Add state**: `sharepointBrowseDocId` to track which document row opened the browser
3. **Configured indicator** (has URL): Keep current — `Link2` icon in primary color linking to SharePoint, with "SP" label
4. **Unconfigured indicator** (no URL): Change to `Unlink` icon (or `Link2Off`) in muted/warning style with a `cursor-pointer`. On click, open `SharePointLinkDialog` for that document
5. **On link selected**: Call a Supabase update to set `source_template_url` on the document, then invalidate the query
6. **Render** `SharePointLinkDialog` once at bottom of component, controlled by `sharepointBrowseDocId` state

### Icon distinction
- **Configured**: `Link2` icon, `text-primary` — clickable link to SP URL (existing)
- **Unconfigured**: `Link2Off` icon, `text-muted-foreground hover:text-primary cursor-pointer` — clicks open SharePoint browser to set the URL inline

This lets users configure SharePoint URLs directly from the list without opening the edit dialog.

