## Fix: get-sharepoint-parent-folder always returns 404

### Root cause (confirmed)
`supabase/functions/get-sharepoint-parent-folder/index.ts` line 56 calls `supabase.auth.getClaims(token)`, which does not exist on `@supabase/supabase-js@2`. On the anon client this leaves the auth context unset, so the subsequent RLS-scoped query on `tenant_sharepoint_settings` runs as `anon` and returns no row → the function falls through to the 404 "SharePoint not configured for this tenant".

### Change (single file)
`supabase/functions/get-sharepoint-parent-folder/index.ts` — auth section only.

1. Initialise the Supabase client with the service role key and drop the `global.headers.Authorization` option:
   ```ts
   const supabase = createClient(
     Deno.env.get("SUPABASE_URL")!,
     Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
   );
   ```
2. Replace the broken `getClaims` block with the standard `getUser(token)` pattern, returning 401 on failure. Remove the unused `claimsData` / `claimsError` symbols.
   ```ts
   const { data: { user }, error: userError } = await supabase.auth.getUser(token);
   if (userError || !user) {
     return json({ error: "Unauthorized" }, 401);
   }
   ```
3. Keep the existing `tenant_sharepoint_settings` query unchanged — including the explicit `.eq("tenant_id", tenant_id)` filter, which becomes the sole tenant-isolation guard now that the query runs under service role.

Nothing else in the file changes: Zod validation, `resolveDriveItemFromSharingUrl`, the `graphGet(...parent...)` call, status codes, and response shape are all preserved.

### Out of scope (explicitly untouched)
- `supabase/functions/_shared/graph-app-client.ts`
- All frontend code (the `handleOpenSharePointFolder` caller continues to send `{ file_url, tenant_id }` and receive `{ folder_url }`)
- Database tables, views, migrations, RLS policies
- Any other edge function

### Reference
`supabase/functions/verify-compliance-folder/index.ts` uses the same service-role + `getUser(token)` pattern in production.

### Backward compatibility
- Request contract unchanged (`POST { file_url, tenant_id }`, Bearer token).
- Response contract unchanged (`200 { folder_url }`, `401`, `400`, `404`, `422`, `502`).
- Success path now reachable for the first time — the 404 was a bug, not a feature any caller depended on.

### Tenant isolation
Authentication is still enforced (401 if `getUser` fails). Tenant scoping moves from RLS to the explicit `.eq("tenant_id", tenant_id)` filter on `tenant_sharepoint_settings`. A malicious authenticated caller could pass an arbitrary `tenant_id`; the function would then return either a parent SharePoint URL (if that tenant exists) or 404. **This is a behavioural change vs. the intended-but-broken RLS design.** Mitigations to consider:

- The endpoint only returns a SharePoint `webUrl` for a file the caller already possesses a sharing URL to (they must pass `file_url` themselves). It doesn't enumerate or leak tenant data beyond the parent folder URL of a file the caller can already address.
- If stricter isolation is required, add a membership check via `has_tenant_access(user.id, tenant_id)` or `get_current_user_tenant_id()` before the `tenant_sharepoint_settings` lookup. **Not included in this fix** per the user's "auth section only" scope, but flagged as a follow-up.

### Risk assessment
- **Low** for the primary bug fix — mirrors a proven pattern already in production (`verify-compliance-folder`).
- **Low–medium** for tenant isolation — the new model relies on the `tenant_id` filter rather than RLS. Acceptable given the limited data exposed (parent folder webUrl of a file the caller already has), but a follow-up membership check is recommended.
- **No** impact on Graph API behaviour, response shape, error codes, or callers.
- **No** migrations, no secret changes (`SUPABASE_SERVICE_ROLE_KEY` is auto-provisioned).
