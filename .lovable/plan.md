# Fix: Client Ask Viv 500 due to role validation in Fact Builder

## Problem
`supabase/functions/compliance-assistant-client/index.ts` line 286 passes `profile.unicorn_role || "User"` to `buildAskVivFacts`. The Fact Builder's `validateInput` only accepts Vivacity internal roles (`Super Admin`, `Team Leader`, `Team Member`) and throws on `"User"`, producing a 500 (`FACT_BUILDER_ERROR`) for every client Ask Viv request.

## Change
Single-line edit at line 286:

Before:
```ts
role: profile.unicorn_role || "User",
```

After:
```ts
role: isVivacityInternal(profile) ? (profile.unicorn_role ?? "Team Member") : "Team Member",
```

`isVivacityInternal` is already imported (line 27) and used immediately above (line 209), so no new imports.

## Why this is safe

1. **Authorization is unchanged.** `validateClientAskVivAccess` (line 224) already gates the request on `unicorn_role ∈ {Admin, User}`, active state, and exactly-one active `tenant_members` row. The role passed to the Fact Builder is *not* an authorization input — it's a label the builder uses for its own internal scope inference.
2. **Tenant scoping is unchanged.** `tenant_id: gateTenantId` is the resolved tenant from `validateClientAskVivAccess`, not derived from role.
3. **Sensitive-fact leakage is prevented downstream.** The deny-list filter at lines 298–303 (`DENIED_SOURCES` / `DENIED_KEY_FRAGMENTS`) strips internal facts before they reach the client response, regardless of the role label used during derivation.
4. **Vivacity preview path preserved.** When a Vivacity staffer previews as a client, `isVivacityInternal(profile)` is true, so their actual `unicorn_role` is forwarded — matching prior behavior for that path.
5. **No DB, RLS, FK, migration, or shared-file changes.** Only the one expression in `compliance-assistant-client/index.ts` is modified. `validation.ts`, `ask-viv-access.ts`, and the Fact Builder remain untouched.

## Out of scope (explicitly not changed)
- `_shared/ask-viv-fact-builder/validation.ts` role allow-list
- `_shared/ask-viv-access.ts` gates
- Any RLS policy, migration, or table

## Risk assessment
- **Functional risk:** Negligible. Restores the previously-intended client path; no other call sites of `buildAskVivFacts` are affected.
- **Security risk:** None introduced. Authorization gate and deny-list filter both remain. Role label is internal to fact derivation; it does not widen DB access (the supabase client passed in is the same one used before).
- **Audit risk:** None. `audit_ask_viv_access_denied` writes still occur via `validateClientAskVivAccess`. No audit fields depend on the role label forwarded to the builder.
- **Backward compatibility:** Vivacity preview-as-client behavior preserved; pure-client behavior fixed (was 500, now functional).

## Verification after apply
1. Client user (`unicorn_role = User`) issues an Ask Viv question → 200 with facts; no `FACT_BUILDER_ERROR` in logs.
2. Vivacity staffer previewing a tenant → still 200; role forwarded as their actual role.
3. Non-client/non-Vivacity user → still denied at `validateClientAskVivAccess` (unchanged).
