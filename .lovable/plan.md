# Fix: "Link to SharePoint" button does nothing on Master Documents detail

## Root cause
`src/components/governance/GovernanceDocumentDetail.tsx` line 285 conditionally renders the SharePoint picker dialog only when `profile?.tenant_id` is truthy:

```tsx
{showSharePointBrowser && profile?.tenant_id && (() => { ... <Dialog/> ... })()}
```

SuperAdmin / internal Vivacity staff browsing the global Master Documents library have no `tenant_id` on their profile, so the dialog never mounts and the button appears dead. State updates correctly — only the render is gated.

The gate is also unnecessary: the dialog uses `<SharePointFileBrowser sitePurpose="master_documents" …/>`, which bypasses the per-tenant SharePoint settings path entirely (see `SharePointFileBrowser.tsx` lines 59–61). The `tenantId` prop is effectively unused in `master_documents` mode.

## Change

**File:** `src/components/governance/GovernanceDocumentDetail.tsx`

1. Remove the `profile?.tenant_id` requirement from the dialog render guard (line 285). Keep only `showSharePointBrowser`.
2. Pass `profile?.tenant_id ?? 0` as the `tenantId` prop to `SharePointFileBrowser` so the prop type stays satisfied without forcing a real tenant. (The component ignores it when `sitePurpose` is set.)

No other behaviour changes. The "Master Documents — Select Template File" dialog, framework auto-folder logic, save-to-`documents.source_template_url`, toast messaging, and query invalidation all stay exactly as they are.

## Out of scope

- No changes to `SharePointFileBrowser`, auth, or the underlying SharePoint browser hook.
- No changes to the per-tenant SharePoint linking flow elsewhere in the app.
- No styling or copy changes.

## Verification

1. As a SuperAdmin on `/manage-documents`, open any document detail (e.g. CP.S1-Credentials Policy).
2. Click **Link to SharePoint** → the "Master Documents — Select Template File" dialog should now open.
3. Select a file → toast "SharePoint URL saved" appears, `documents.source_template_url` is updated, and "View Source" button shows.
4. Confirm the per-tenant SharePoint flow on a client-scoped document detail still works (regression check).
