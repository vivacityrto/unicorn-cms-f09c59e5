## Plan

Update `supabase/functions/tga-integration/index.ts` to allow all internal Vivacity staff (not just SuperAdmin) to run TGA Probe and Sync/Import operations.

### Change 1 — Probe (GET, lines 250–274)
Replace the `users.global_role`-based SuperAdmin check with an `is_vivacity_internal` check:

- Select `unicorn_role, is_vivacity_internal` instead of `global_role`.
- Set `isVivacityStaff = userProfile?.is_vivacity_internal === true`.
- If not Vivacity staff, fall back to the existing Tenant Admin check (`tenant_members.role === 'Admin'`, scoped by `parseInt(tenantId)`).
- Update the 403 error message to: `'Access required: Vivacity staff or Tenant Admin'`.

### Change 2 — Sync (POST, lines 312–336)
Same replacement, using the in-scope `tenant_id` variable (no `parseInt`, already numeric from JSON body):

- Same profile query and `isVivacityStaff` check.
- Tenant Admin fallback uses `.eq('tenant_id', tenant_id)`.
- Same updated 403 message.

### Out of scope
No other logic in the file changes — TGA fetch, mapping, DB writes, and job status updates remain untouched. The `is_vivacity_team_safe` RPC referenced in the request is satisfied by reading the equivalent denormalized `users.is_vivacity_internal` flag, which avoids an extra RPC round trip and matches the pattern used elsewhere in the codebase.
