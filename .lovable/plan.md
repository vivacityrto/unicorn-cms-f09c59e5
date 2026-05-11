## Goal

Short-circuit `useClientNotifications` for users with `access_scope = 'academy_only'` so they receive no client portal notifications and no realtime subscription is opened.

## Changes (single file: `src/hooks/useClientNotifications.tsx`)

1. Destructure `isAcademyOnly` from `useClientTenant()`.
2. Set `enabled: !!profile?.user_uuid && !!activeTenantId && !isAcademyOnly` on the query.
3. Skip the realtime subscription when `isAcademyOnly` is true (early-return in the `useEffect` and add `isAcademyOnly` to its deps).
4. When `isAcademyOnly` is true, return:
   - `notifications: []`
   - `unreadCount: 0`
   - `unreadByType: {}`
   (Mutations and the spread `query` state remain present but harmless since the query is disabled.)

## Out of scope

- No DB migration.
- No other files touched.
- No change to `CLIENT_FACING_TYPES` or mutation behaviour.
