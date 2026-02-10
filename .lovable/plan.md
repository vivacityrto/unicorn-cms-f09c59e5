

## Plan: Consolidate `/clients/:id` to `/tenant/:id`

### What changes

Replace the legacy `TenantDetail` page at `/tenant/:tenantId` with the new `ClientDetail` page, and update all navigation references from `/clients/` to `/tenant/`.

### Route changes in `src/App.tsx`

- **Remove** the route `/clients/:tenantId` pointing to `ClientDetailWrapper`
- **Replace** the existing `/tenant/:tenantId` route from `TenantDetailWrapper` to `ClientDetailWrapper`
- **Update** `/clients/:clientId/impact` to `/tenant/:clientId/impact`
- Remove the `TenantDetailWrapper` lazy import (no longer used at this route)

### Navigation link updates (9 files)

All `navigate('/clients/...')` calls updated to `navigate('/tenant/...')`:

| File | What changes |
|------|-------------|
| `src/pages/ManageTenants.tsx` | Row click navigates to `/tenant/:id` |
| `src/pages/MyWork.tsx` | Tenant name link + action button |
| `src/pages/TenantDocuments.tsx` | Back button |
| `src/pages/TenantDocumentsHub.tsx` | Back button |
| `src/pages/TenantNotes.tsx` | Back button |
| `src/components/dashboard/MyWorkWidget.tsx` | Tenant link + action button |
| `src/components/membership/MembershipGrid.tsx` | Multiple "View Client" buttons |
| `src/hooks/useMissingMergeFields.tsx` | Notification link |
| `src/pages/AdminPackageTenantDetail.tsx` | "View Full Profile" button (already points to `/tenant/`, no change needed) |

### Files removed or deprecated

- `src/pages/TenantDetailWrapper.tsx` -- no longer referenced (legacy page wrapper)
- `src/pages/TenantDetail.tsx` -- no longer routed (legacy page itself can remain in codebase but is unreachable)

### What stays the same

- All other `/tenant/:tenantId/*` sub-routes (logins, members, documents, notes, tasks) remain unchanged
- The `ClientDetail` page component itself is unchanged
- Legacy numeric IDs continue to work since the path parameter name stays `:tenantId`
- No database or backend changes required

