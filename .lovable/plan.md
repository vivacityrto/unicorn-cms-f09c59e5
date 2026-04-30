# Add `validateClientAskVivAccess` to `_shared/ask-viv-access.ts`

## Goal

Add a sibling helper to the existing `validateAskVivAccess` that gates the new **client-mode** Ask Viv endpoints. It returns the resolved `tenant_id` on success so callers can immediately use it for the daily-cap RPC against `ai_client_query_usage`.

## File touched

- `supabase/functions/_shared/ask-viv-access.ts` — append one new exported function. Do **not** modify `validateAskVivAccess`, `logDeniedAccess`, `isVivacityInternal`, or `askVivAccessDeniedResponse`.

## Audit findings (read-only verification)

1. **Membership table**: Both `tenant_members` and `tenant_users` exist in `public`. The user's instructions say to query `tenant_members`. Confirmed schema:
   - `tenant_id bigint`, `user_id uuid`, `role text`, `status text`, …
   - 391 rows currently with `status = 'active'`.
2. **Column name correction**: The user's spec says "`user_uuid = userId`" — but `tenant_members` has no `user_uuid` column; the FK is `user_id uuid`. Plan uses `user_id = userId` (which is what the spec clearly intends — the auth uid).
3. **Roles in DB**: `Admin` (397), `User` (70), `Super Admin` (13), `Team Member` (7). Gating on `Admin`/`User` is correct for client-mode.
4. **`profile.state` vs `.status`**: Confirmed `UserProfile` interface (line ~28-35 of the file) exposes `state`, not `status`. The existing `validateAskVivAccess` reads `profile?.status` which is always `undefined` — that's the latent bug the user called out. We will **not** fix it in that function (out of scope), but the new function will use `state` correctly.
5. **`logDeniedAccess` signature**: `(supabase, userId, userRole, endpoint, reason)` — reused as-is.

## Implementation

Append the following to the bottom of `supabase/functions/_shared/ask-viv-access.ts` (before or after `askVivAccessDeniedResponse`, doesn't matter — placed right after `validateAskVivAccess` for readability):

```ts
/**
 * Client roles that may use Ask Viv in client mode.
 */
const CLIENT_ASK_VIV_ROLES = ["Admin", "User"];

/**
 * Validate Ask Viv access for CLIENT mode.
 *
 * Distinct from validateAskVivAccess (which is for Vivacity internal staff).
 * On success, returns the resolved tenant_id so callers can scope the
 * daily-cap RPC against ai_client_query_usage without a second lookup.
 *
 * Fail-fast checks:
 *  1. unicorn_role must be 'Admin' or 'User'.
 *  2. profile.state must not be 'inactive' or 'suspended'.
 *  3. Exactly one active tenant_members row must exist for the user.
 */
export async function validateClientAskVivAccess(
  supabase: SupabaseClient,
  userId: string,
  profile: UserProfile | null,
  endpoint: string
): Promise<
  | { allowed: true; tenant_id: number }
  | { allowed: false; reason: string }
> {
  // 1. Role gate
  const role = profile?.unicorn_role ?? null;
  if (!role || !CLIENT_ASK_VIV_ROLES.includes(role)) {
    await logDeniedAccess(supabase, userId, role ?? "unknown", endpoint, "not_client_role");
    return { allowed: false, reason: "not_client_role" };
  }

  // 2. Account state gate (NOTE: UserProfile uses `state`, not `status`)
  if (profile?.state === "inactive" || profile?.state === "suspended") {
    await logDeniedAccess(supabase, userId, role, endpoint, "user_archived");
    return { allowed: false, reason: "user_archived" };
  }

  // 3. Tenant membership resolution — must be exactly one active membership
  const { data: memberships, error } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) {
    console.error("validateClientAskVivAccess: tenant_members query failed", error);
    await logDeniedAccess(supabase, userId, role, endpoint, "membership_lookup_failed");
    return { allowed: false, reason: "membership_lookup_failed" };
  }

  const rows = memberships ?? [];
  if (rows.length === 0) {
    await logDeniedAccess(supabase, userId, role, endpoint, "no_tenant_membership");
    return { allowed: false, reason: "no_tenant_membership" };
  }
  if (rows.length > 1) {
    await logDeniedAccess(supabase, userId, role, endpoint, "multiple_memberships");
    return { allowed: false, reason: "multiple_memberships" };
  }

  return { allowed: true, tenant_id: Number(rows[0].tenant_id) };
}

/**
 * Map an internal denial reason code to a user-friendly message string
 * suitable for the response body. Use with askVivAccessDeniedResponse().
 */
export function clientAskVivDenialMessage(reason: string): string {
  switch (reason) {
    case "not_client_role":
      return "Ask Viv client mode is for client-tenant users only.";
    case "user_archived":
      return "Your account is no longer active.";
    case "no_tenant_membership":
      return "No active tenant membership was found for your account.";
    case "multiple_memberships":
      return "Your account is linked to multiple tenants. Contact support to resolve.";
    case "membership_lookup_failed":
      return "We couldn't verify your tenant membership. Please try again.";
    default:
      return "Ask Viv access denied.";
  }
}
```

## Caller usage pattern (informational, not part of this change)

```ts
const check = await validateClientAskVivAccess(supabase, user.id, profile, "compliance-assistant-client");
if (!check.allowed) {
  return askVivAccessDeniedResponse(clientAskVivDenialMessage(check.reason));
}
const tenantId = check.tenant_id; // bigint, ready for ai_client_query_usage
```

## Backward compatibility / risk

- Pure addition; no existing exports modified. Zero impact on `validateAskVivAccess` or any current Ask Viv internal endpoint.
- No DB schema, RLS, FK, or migration impact. Read-only query against `tenant_members`.
- Bigint safety: `tenant_members.tenant_id` is `bigint`; PostgREST returns it as a JS number for values within safe-int range (current max tenant_id is well within), then explicitly coerced via `Number(...)`.
- The new function intentionally does **not** fix the latent `profile.status` bug in the existing `validateAskVivAccess` (out of scope per instructions).

## Risk assessment

- **Low**. Single additive helper in a shared file. No call sites yet wired up — adding it cannot regress current behaviour. The only behavioural assumption is that v1 client users have exactly one active `tenant_members` row, which matches current data (391 active rows, no multi-tenant client users today).

## Decisions needed

None. The user spec said `user_uuid` but the column is `user_id` — proceeding with `user_id` because that's the actual schema and matches the spec's clear intent (auth uid lookup).
