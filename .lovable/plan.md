## Plan: Replace tier-derived badge with relationship_role label in Academy chrome

### Problem
The Academy dropdown badge and sidebar-bottom badge currently render `Academy {tierLabel}` — when `academyTier` is null/undefined this produces "Academy Academy". We should show the user's actual `relationship_role` label (e.g. "Academy User", "Primary Contact") instead.

### Changes

#### 1. New hook: `src/hooks/useCurrentRelationshipRole.ts`
Create a hook that queries `tenant_users.relationship_role` for the current user's `user_uuid` on `profile.tenant_id`.

- Returns `{ relationshipRole: RelationshipRole | null, isLoading: boolean }`
- Uses `useAuth` for `profile.user_uuid` and `profile.tenant_id`
- Query key: `["current-relationship-role", userUuid, tenantId]`
- `staleTime: 5 * 60 * 1000`
- Uses `.maybeSingle()` so missing rows return `null` rather than erroring

#### 2. `src/components/layout/AcademyTopBar.tsx`
- Remove `useTenantType` import and `const { academyTier } = useTenantType();`
- Remove the `getTierLabel()` function entirely.
- Add imports:
  - `useCurrentRelationshipRole` from `@/hooks/useCurrentRelationshipRole`
  - `relationshipRoleLabel` from `@/lib/roles/relationshipRole`
- Add `const { relationshipRole } = useCurrentRelationshipRole();`
- Replace `<Badge>Academy {getTierLabel()}</Badge>` inner text with `{relationshipRoleLabel(relationshipRole)}`

#### 3. `src/components/layout/AcademyLayout.tsx`
- **Keep** `useTenantType` import and `const { academyTier } = useTenantType();` — `academyTier` is still required for `showTeamSection` on line 90.
- Add imports:
  - `useCurrentRelationshipRole` from `@/hooks/useCurrentRelationshipRole`
  - `relationshipRoleLabel` from `@/lib/roles/relationshipRole`
- Add `const { relationshipRole } = useCurrentRelationshipRole();`
- Replace sidebar-bottom badge text (lines 259-262) with `{relationshipRoleLabel(relationshipRole)}`

### Out of scope
- `useTenantType` context, `academyTier` derivation, tenant_type enum, `AcademyTier` type — unchanged.
- `AcademySettings.tsx`, billing UI, plan comparison cards — untouched.
- Other tier-referencing files (`useSeatLimits.ts`, `navigationConfig.ts`, etc.) — untouched.

### Verification
- `rg "getTierLabel" src/components/layout/AcademyTopBar.tsx` → zero matches.
- As `academy_user` → both badges read "Academy User".
- As `primary_contact` or `secondary_contact` → both badges read corresponding label.
- As user with no `tenant_users` row → badges read "—".
- TypeScript builds clean.
