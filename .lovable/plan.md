## Goal
Fix the secondary-contact gating bug so the Invite button, task checkboxes, and bulk action bar are enabled in the client portal for any contact with `canManagePortalUsers` (primary or secondary), instead of using the staff-only `getTenantRole(...) === "Admin"` check that always returns null for client portal contacts.

Scope is strictly limited to two files. No DB, RLS, or other permission logic touched.

## Changes

### 1. `src/pages/ClientTasksPage.tsx`
- Remove `import { useAuth } from "@/hooks/useAuth";` (line 4) — `getTenantRole` is the only thing pulled from it.
- In the component body, replace:
  ```ts
  const { getTenantRole } = useAuth();
  const { activeTenantId } = useClientTenant();
  const isAdmin = activeTenantId ? getTenantRole(activeTenantId) === "Admin" : false;
  ```
  with:
  ```ts
  const { canManagePortalUsers } = useClientTenant();
  ```
  (`activeTenantId` is no longer needed in this file — confirm no other usage before removing; if used elsewhere, keep it on the destructure.)
- Replace the three `isAdmin` references (lines 116, 145, 169) with `canManagePortalUsers`. These gate:
  - the bulk action bar (`isAdmin && selected.size > 0`)
  - the header checkbox column
  - the per-row `showCheckbox` prop

### 2. `src/components/client/ClientUsersPage.tsx`
- Remove `import { useAuth } from "@/hooks/useAuth";` (line 46) — `getTenantRole` is the only thing pulled from it.
- Replace:
  ```ts
  const { activeTenantId } = useClientTenant();
  const { getTenantRole } = useAuth();
  ...
  const isAdmin = activeTenantId ? getTenantRole(activeTenantId) === "Admin" : false;
  ```
  with:
  ```ts
  const { canManagePortalUsers } = useClientTenant();
  ```
  (Drop `activeTenantId` from the destructure if no longer referenced; otherwise keep it.)
- Invite button block (lines ~225–239): remove the `<Tooltip><TooltipTrigger asChild>…</TooltipTrigger>{!isAdmin ? <TooltipContent>Admin only.</TooltipContent> : null}</Tooltip>` wrapper entirely. Render the button bare, with `disabled={!canManagePortalUsers}` and without the `cursor-not-allowed` class (since it will not be disabled for any user who actually reaches this page — `ClientRouteGuard` already blocks others).
- Replace the remaining `isAdmin` reference at line 310 (`row.row_type === "invited" && isAdmin`) with `canManagePortalUsers` — gates the Resend / Revoke dropdown on invited rows.
- Leave the other `Tooltip`/`TooltipProvider`/`TooltipContent` imports and usages alone (they are used by the status pill at lines 117–133 and by the page-wide `TooltipProvider` wrapper at 243/358).

## Non-goals / guardrails
- Do not touch `ClientSidebar.tsx`, `ClientRouteGuard.tsx`, `ClientTenantContext.tsx`, `useAuth.tsx`, or any RLS/migration.
- Do not change the task filter tabs, counts, "Show archived" toggle, task row rendering, due-date colouring, badges, user table columns, status pill, or any other unrelated UI.
- Do not introduce a replacement tooltip or helper text on the Invite disabled state.

## Verification
- Type-check passes (no dangling `getTenantRole` / `isAdmin` / `useAuth` references).
- As a secondary contact: Invite button enabled with no tooltip; task checkboxes visible; bulk action bar appears on selection; Resend/Revoke dropdown visible on invited rows.
- As an academy-only or non-managing user: `ClientRouteGuard` continues to block the page, so the bare Invite button is never reached.