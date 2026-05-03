# Users page — Phase 1: read-only list view

## Verified facts before planning

- **Current route target**: `/client/users` is wired to `src/pages/client/ClientUsersWrapper.tsx`, which currently renders the legacy `@/pages/TeamSettings` page (not a blank skeleton — the prompt was slightly off here). We replace its inner content with the new `ClientUsersPage`. `ClientLayout` wrapper stays.
- **Schema confirmed** for `tenant_users`, `users`, `user_invitations`. All columns the prompt's view depends on exist (`users.full_name`, `users.avatar_path`, `users.is_vivacity_internal`, `users.last_sign_in_at`, `users.archived`, `users.disabled`; `tenant_users.relationship_role`, `primary_contact`, `secondary_contact`, `access_scope`, `created_at`; `user_invitations.status`, `accepted_at`, `revoked_at`, `expires_at`, `first_name`, `last_name`, `email`, `created_at`, `relationship_role`).
- **Enum confirmed**: `tenant_user_role` has exactly the four values the prompt expects: `primary_contact`, `secondary_contact`, `user`, `academy_user`.
- **Tenant context**: `useClientTenant()` exposes `activeTenantId: number | null` — same pattern used by every other client-portal hook.

## What gets built

### 1. Migration — `v_client_tenant_users`

Strictly additive view, `security_invoker = true`, UNION ALL of two CTEs:

- **`active_users`** — `tenant_users` JOIN `users`, filtered:
  - `NOT COALESCE(u.archived, false)`
  - `NOT COALESCE(u.is_vivacity_internal, false)` (per the prompt's important addition — Vivacity CSCs must not appear in client-facing user lists)
- **`pending_invites`** — `user_invitations` filtered to `status = 'pending'`, `accepted_at IS NULL`, `revoked_at IS NULL`, `expires_at > now()`.

Output columns: `row_type`, `row_key`, `tenant_id`, `user_id`, `first_name`, `last_name`, `display_name`, `email`, `avatar_path`, `relationship_role`, `primary_contact`, `secondary_contact`, `access_scope`, `last_sign_in_at`, `invited_at`, `invite_expires_at`, `status`, `member_since`.

`status` derived: `disabled` / `archived` / `active` for confirmed users, `invited` for pending. `display_name` falls back through `full_name` → `first_name + last_name` → `email` → `'Unnamed user'`. `GRANT SELECT … TO authenticated`. RLS continues to be enforced by the underlying base tables via `security_invoker`.

### 2. Hook — `src/hooks/use-client-tenant-users.ts`

`useClientTenantUsers()` using TanStack Query. Reads `activeTenantId` from `useClientTenant()`, gates the query with `enabled: !!activeTenantId`, explicit `.eq('tenant_id', activeTenantId!)`, ordered active-before-invited then primary_contact-first then display_name. `staleTime: 30_000`. Exports the `ClientTenantUserRow` type and the union types for row_type / status / role. Strictly typed, no `any`.

### 3. Page component — `src/components/client/ClientUsersPage.tsx`

New component, no edits to existing pages. Structure:

- **Header**: "Users" title, subtitle copy, disabled "Invite user" button (cyan primary look, `cursor-not-allowed`) wrapped in shadcn `Tooltip` with content "Coming soon — for now, contact your CSC to add users."
- **Count summary**: `{activeCount} active · {invitedCount} pending invite(s)`.
- **Table** (shadcn `Table`): columns User / Role / Status / Last active.
  - User cell: shadcn `Avatar` (image when `avatar_path` present, otherwise initials via local `getInitials` helper) + name + muted email.
  - Role pill: `formatRelationshipRole(...)` mapping enum to friendly label; `primary_contact` rendered with emphasised brand-coloured `Badge` variant, others default.
  - Status: small coloured dot + text via local `StatusDot` component (emerald/amber/slate per status).
  - Last active: `formatDistanceToNow(parseISO(...), { addSuffix: true })` from `date-fns` (already a project dep). For pending rows shows "Invited X ago"; for active rows with no `last_sign_in_at` shows muted "Never".
- **States**:
  - Loading → 3 skeleton rows.
  - Error → destructive inline alert "Couldn't load users."
  - Empty → centred placeholder card "No users yet" + subtext.
- **Mobile**: role + status collapse below the user cell on `<md`; Last active hidden on narrow viewports (Tailwind `hidden md:table-cell`).

All colours via design-system tokens (semantic Tailwind classes / shadcn variants). No hardcoded hex.

### 4. Route wire-up — `src/pages/client/ClientUsersWrapper.tsx`

Replace the lazy-loaded `TeamSettings` import with the new `ClientUsersPage`. `ClientLayout` and the Suspense fallback stay. No change to `src/App.tsx`.

## What is NOT changed

- `tenant_users`, `users`, `user_invitations`, or any other table.
- Any existing view.
- The legacy `TeamSettings` page file (left in place — it has other usages or can be cleaned up later; out of scope).
- Side-nav config (Prompt A's gating already applied).
- `App.tsx` routes.

## RLS / security notes

- `security_invoker = true` means querying the view runs each underlying SELECT with the caller's privileges — existing RLS on `tenant_users`, `users`, `user_invitations` keeps cross-tenant data invisible.
- The hook also adds an explicit `.eq('tenant_id', activeTenantId)` belt-and-braces filter so the query URL always carries the tenant scope (visible in network tab for verification).
- Direct URL access to `/client/users` by a non-admin tenant user still resolves (gating is nav-level only). Per the prompt this is acceptable for v1; non-admins seeing fellow tenant users isn't a leak.

## Sanity SQL run after the migration

I'll run these via `supabase--read_query` and report the results:

```sql
-- AHMRC tenant
SELECT row_type, status, display_name, email, relationship_role, primary_contact
FROM v_client_tenant_users WHERE tenant_id = 7449
ORDER BY row_type, display_name;

-- Platform-wide distribution
SELECT row_type, status, COUNT(*) FROM v_client_tenant_users GROUP BY 1,2 ORDER BY 3 DESC;

-- Reconciliation
SELECT
  (SELECT COUNT(*) FROM v_client_tenant_users WHERE row_type='active') AS view_active,
  (SELECT COUNT(*) FROM tenant_users tu JOIN users u ON u.user_uuid=tu.user_id
   WHERE NOT COALESCE(u.archived,false) AND NOT COALESCE(u.is_vivacity_internal,false)) AS direct;
```

## Files touched

- `supabase/migrations/<timestamp>_v_client_tenant_users.sql` (new)
- `src/hooks/use-client-tenant-users.ts` (new)
- `src/components/client/ClientUsersPage.tsx` (new)
- `src/pages/client/ClientUsersWrapper.tsx` (swap inner import)

No other files modified.
