

## Plan: Fix "Unable to determine tenant" when SuperAdmin saves a Suggestion

### Problem

In `src/pages/NewSuggestionForm.tsx` the submit handler reads `profile?.tenant_id` and aborts with a toast if it's missing. Vivacity SuperAdmins (and most internal staff) don't have a single `tenant_id` on their profile because they operate across all tenants — so the form is unusable for the very people who triage suggestions.

The Suggestions module is an **internal Vivacity tool**, not a per-client feature, so every suggestion logically belongs to the Vivacity tenant (`VIVACITY_TENANT_ID = 6372`, already exported from `src/hooks/useVivacityTeamUsers`).

### Fix

In `src/pages/NewSuggestionForm.tsx`:

1. Import `VIVACITY_TENANT_ID` from `@/hooks/useVivacityTeamUsers` and `useRBAC` (or reuse `profile.unicorn_role` already on the profile) to detect Vivacity staff.
2. Resolve the effective tenant id with this precedence:
   - If the user is Vivacity staff → use `VIVACITY_TENANT_ID`.
   - Else if `profile?.tenant_id` is set → use it.
   - Else → keep the existing toast (genuine edge case).
3. Replace the line `const tenantId = profile?.tenant_id;` with the resolved value, and only block submission when `!user` or no tenant could be resolved at all.

No schema, RLS, or hook changes required — `useCreateSuggestItem` already accepts whatever `tenant_id` is passed.

### Verification

- Logged in as SuperAdmin (no `profile.tenant_id`): create a suggestion → saves successfully, `tenant_id` = 6372, redirects to detail page.
- Logged in as a tenant Admin: behaviour unchanged, suggestion saved against their tenant.
- Logged out / no profile: still shows the existing error toast.

### Out of scope

- Adding a tenant picker on the form (suggestions are global to Vivacity by design).
- Backfilling/migration — no existing data is affected.

