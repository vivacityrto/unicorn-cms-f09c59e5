
## Scope

Two fixes on `/client/governance-documents`:

1. **View opens in read-only mode** — rewrite the Office Online URL from `action=default` to `action=view`.
2. **Per-document SharePoint folder navigation** — replace the single tenant-level "governance folder" button with a per-row button that resolves each generated file's actual SharePoint parent folder via a new edge function.

No DB migration. No changes to RLS, view, GRANTs, status filter, framework/category filters, sort, search, empty states, or `canAccess` guard.

## Changes

### 1. `src/components/client/ClientGovernanceDocumentsPage.tsx`

- `handleView`: open `row.file_path.replace("action=default", "action=view")` so the browser viewer loads in read-only Word/Excel/PowerPoint Online mode (most generated `generated_file_url` values already carry `action=default`; if the substring is absent, `replace` is a no-op and the original URL opens unchanged — backward compatible).
- Remove `governanceFolderUrl` from `GovernanceQueryResult`, the `Promise.all` (drop the `tenant_sharepoint_settings` fetch entirely from this query — page-load no longer needs it), the destructure, `showSharePointButton`, and `handleOpenSharePoint`.
- Re-add `useToast` import + `const { toast } = useToast()`.
- Add `const [openingSharePointId, setOpeningSharePointId] = useState<string | null>(null)`.
- Add `handleOpenSharePointFolder(row)` per spec: invokes `get-sharepoint-parent-folder` with `{ file_url: row.file_path, tenant_id: activeTenantId }`, opens returned `folder_url` in a new tab, shows destructive toast on failure, clears loading id in `finally`.
- Replace the tenant-level SharePoint button with a per-row button rendered only when `row.file_path` is non-null (mirrors the View button condition). Disabled + spinner (`Loader2 animate-spin`) when `openingSharePointId === row.id`. Icon `ExternalLink`, label "SharePoint".
- Keep `ExternalLink` import; add `Loader2` to lucide-react imports.

### 2. `supabase/functions/get-sharepoint-parent-folder/index.ts` (new)

Structure modelled on existing SharePoint edge functions (e.g. `deliver-governance-document`, `verify-compliance-folder`). Uses `resolveDriveItemFromSharingUrl` and `graphGet` from `../_shared/graph-app-client.ts` — no separate Graph auth.

Flow:

1. CORS preflight via shared `corsHeaders`.
2. Validate request body with Zod: `{ file_url: string().url(), tenant_id: z.number().int().positive() }`. Return 400 on failure.
3. Read `Authorization` bearer header; 401 if missing.
4. Create a Supabase client bound to the user's JWT (anon key + `global.headers.Authorization`) and call `supabase.auth.getClaims(token)`; 401 if invalid.
5. Query `tenant_sharepoint_settings` **with the user's JWT** (RLS enforces tenant isolation — the caller can only read their own tenant's row): `select('tenant_id').eq('tenant_id', tenant_id).maybeSingle()`. If no row → 404 `{ error: "SharePoint not configured for this tenant" }`. This is the authorisation gate: a user from tenant A who passes tenant B's id sees `null` because RLS hides the row.
6. Wrap `resolveDriveItemFromSharingUrl(file_url)` in try/catch → on throw return 422 `{ error: "Unable to resolve SharePoint file. URL may be invalid or the app lacks access." }`.
7. Call `graphGet(/drives/{driveId}/items/{itemId}/parent?$select=id,name,webUrl)`. On non-2xx return matching HTTP status with `{ error }`.
8. Return 200 `{ folder_url: parent.webUrl }`.

All responses include `corsHeaders` + JSON content-type. No writes, no audit log entry (read-only navigation helper — consistent with existing `verify-compliance-folder` which also doesn't audit a folder lookup).

`supabase/config.toml`: default `verify_jwt = false` is fine — JWT is validated in code as above.

## Audit / Access-Control Analysis

- **Tenant isolation**: relies on RLS on `tenant_sharepoint_settings` (already in place — used the same way by existing client-side queries). Passing a foreign `tenant_id` returns null → 404. The Graph call itself is gated behind that check, so a user cannot probe arbitrary SharePoint URLs for tenants they don't belong to.
- **File-URL scoping**: we do not cross-check that `file_url` belongs to the caller's tenant. This matches current behaviour (the existing page already opens `generated_file_url` directly from a row the caller can read via the governance view's RLS). The parent-folder lookup only succeeds if the Graph app has access, and the gate above ensures only members of a SharePoint-configured tenant can call it at all. Acceptable for read-only navigation; documented here for future hardening if needed.
- **No data mutations** → no audit-log requirements changed. No automation, edge functions, or hooks reference `governanceFolderUrl` outside this page (`handleOpenSharePoint`/`showSharePointButton` are local).
- **Backward compatibility**: `action=default` → `action=view` is a no-op when substring absent. Existing `generated_file_url` values without `action=default` continue to open as before. Removing the tenant-level SharePoint button is a UX regression only if a tenant had `governance_folder_url` set but documents had null `file_path` — in that case the user previously had a folder shortcut and now has none. Mitigation: per-row buttons cover the common case (a generated row implies a file in SharePoint).

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `resolveDriveItemFromSharingUrl` fails for legacy/non-SharePoint URLs | Medium | Low | 422 + destructive toast; View button still works |
| Graph rate limits on bulk clicks | Low | Low | Per-click on user action, button disabled during request |
| User loses tenant-level folder shortcut for docs without files | Very low | Low | Documented; can re-add later if requested |
| RLS regression on `tenant_sharepoint_settings` | Very low | High | We use user JWT (not service role) so existing policy stands; no policy change |
| `action=view` not honoured by some Office viewers | Low | Low | Falls back to whatever Office Online decides; no worse than today |

## Summary of Benefits

- Generated docs open read-only by default → prevents accidental client edits to consultant-generated governance files.
- "SharePoint" button now navigates to the *actual* parent folder of each document (could differ by framework/category subfolder under `- Governance/...`), not a stale tenant-level root.
- Removes a `tenant_sharepoint_settings` fetch from page load → one fewer round-trip and one fewer RLS check on initial render.
- Tenant isolation is enforced by RLS via the user's JWT inside the edge function — no service-role privilege escalation.
