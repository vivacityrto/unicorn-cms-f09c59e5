## Fix: HelpCenter access during client impersonation

**Problem:** `HelpCenterProvider` checks `tenant_users` using the staff member's `profile.user_uuid` and `profile.tenant_id`. During client impersonation the staff user has no row in the client's `tenant_users`, so `canAccess` is false and Help Center features hide incorrectly.

**Fix scope:** one file — `src/components/help-center/HelpCenterContext.tsx`.

### Changes

1. Add import: `import { useClientPreview } from "@/contexts/ClientPreviewContext";`
2. Inside `HelpCenterProvider`, call `const { isPreviewMode, actingUserId, actingUserOptions } = useClientPreview();`
3. Derive a preview-mode relationship role:
   ```ts
   const previewRelationshipRole = isPreviewMode && actingUserId
     ? actingUserOptions.find(o => o.user_uuid === actingUserId)?.relationship_role ?? null
     : null;
   ```
4. Gate the existing `tenant_users` query: change `enabled` to `!!userId && !!tenantId && !isPreviewMode`. Leave query shape otherwise unchanged.
5. Resolve the effective role and loading state:
   ```ts
   const effectiveRole = isPreviewMode ? previewRelationshipRole : relationshipRole;
   const effectiveLoading = isPreviewMode ? false : accessLoading;
   ```
6. Use `effectiveRole` for the `canAccess` calculation (rule unchanged: `primary_contact` or `secondary_contact`). Pass `effectiveLoading` as `accessLoading` in the provider value.

### Not changing

- The `canAccess` rule itself.
- Non-preview behaviour (same query, same key, same staleTime).
- Any other file. `ClientPreviewProvider` already wraps the app in `App.tsx`, so the hook is safe to call here.

### Risk

Low. Single component, additive logic, falls through to existing behaviour outside preview mode.