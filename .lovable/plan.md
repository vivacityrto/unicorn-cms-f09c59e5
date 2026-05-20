# Gate the Help Center to primary/secondary contacts only

## Problem
The Help Center (chatbot, CSC, support) is reachable from 15 entry points across the client portal with no role gating. Academy users and `relationship_role='user'` accounts can open the chatbot from the footer, sidebar, topbar, floating chatbot button, ClientHomePage cards, AcademyAccessGate empty state, and package dashboards — and once the drawer is open they can switch to the CSC and support tabs too.

## Policy
A user may see or open any Help Center surface only when their `tenant_users.relationship_role` on the current tenant is `primary_contact` or `secondary_contact`. Everyone else — including academy users, `relationship_role='user'`, Vivacity staff with no client-tenant row, and users still loading — sees nothing. Loading defaults to denied (no flash).

## Approach
Extend the existing `HelpCenterContext` with a single `canAccess` boolean derived from one cached query, then gate every callsite and the drawer itself.

## Changes

### 1. Extend `src/components/help-center/HelpCenterContext.tsx`
- Import `useAuth`, `useClientTenant`, `supabase`, `useQuery`.
- Query `tenant_users.relationship_role` where `user_id = profile.user_uuid` AND `tenant_id = activeTenantId`. React Query with `staleTime: 5 * 60_000`, `enabled` only when both ids are present.
- Derive `canAccess = role === 'primary_contact' || role === 'secondary_contact'`. Default `false` while loading or when query is disabled.
- Expose `canAccess: boolean` and `accessLoading: boolean` on the context value.
- Make `openHelpCenter(tab)` early-return when `!canAccess` (defense in depth for any future callsite that forgets to gate).

### 2. Gate `HelpCenterDrawer.tsx`
At the top: `if (!canAccess) return null;` — belt-and-braces backup so the drawer can never render for non-contacts, even via deep link or programmatic open.

### 3. Hide every entry point
For each file below, wrap the button/component in `{canAccess && (...)}`. Render nothing (not a disabled state) while loading or denied.

- `src/components/help-center/FloatingChatbot.tsx` — early-return `null` when `!canAccess`.
- `src/components/layout/TopBar.tsx` — wrap the help button.
- `src/components/client/ClientTopbar.tsx` — wrap the help button.
- `src/components/client/ClientFooter.tsx` — hide the entire "Get Help" column (heading, three buttons, caption).
- `src/components/client/ClientSidebar.tsx` — hide the three Help Center sidebar items.
- `src/components/client/ClientHomePage.tsx` — gate the four `openHelpCenter` callsites (cards/buttons that wrap each call).
- `src/components/client/package-dashboard/PackageActionRow.tsx` — hide the "Message CSC" button.

### 4. Remove the AcademyAccessGate button
In `src/components/academy/AcademyAccessGate.tsx`:
- Delete the `Button` block (lines 42-49).
- Delete the `useHelpCenter()` call.
- Drop unused imports: `Button`, `MessageCircle`, `useHelpCenter`. Keep `GraduationCap` and `Loader2`.

The empty-state copy already directs the user to their Vivacity consultant, which is the right next step.

## What does NOT change
- `ChatTab`, `MessageTab`, tab content, channel logic.
- `useAuth`, `useClientTenant`, `useUserAccess`.
- Schema, RLS, RPCs, edge functions, routes, navigation config.

## Verification
1. `rg "openHelpCenter\(" src/` — every callsite is either inside the context itself or wrapped in `{canAccess && ...}` / inside a component that early-returns when `!canAccess`.
2. As `primary_contact` and `secondary_contact`: every entry point renders and opens the drawer as today.
3. As `relationship_role='user'`: footer column, sidebar items, topbar button, floating chatbot, ClientHomePage action cards, and package dashboard "Message CSC" are all absent.
4. As `academy_user`: same — and the AcademyAccessGate empty state renders cleanly without the deleted button. Chatbot unreachable from any path.
5. Throttle network and reload — no flash of buttons that then disappear (loading defaults to denied).
6. `tsc --noEmit` clean.

## Risks
- **Vivacity staff** have no `tenant_users` row on client tenants, so they will also lose access to the client-side Help Center surfaces. Per scope this is intended; flag if not.
- **Existing CSC/support threads** remain in the DB; downgraded users keep history but lose the ability to start new messages via this UI. Acceptable.
- **Future callsites:** the `openHelpCenter` no-op protects against forgotten gates, but an unhidden button is still a UX bug. Consider a follow-up lint/test.
