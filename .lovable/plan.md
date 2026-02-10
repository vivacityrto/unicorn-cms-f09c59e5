

## Fix: Client Resource Hub layout leak + separate client/admin resource experiences

### Root Cause

`ResourceHubDashboard.tsx` wraps its content in `<DashboardLayout>`, so when `ClientResourceHubWrapper` lazy-loads it inside `<ClientLayout>`, both layouts render -- the Vivacity Team sidebar appears inside the client portal.

### Solution Overview

1. Extract the resource hub content out of `DashboardLayout` so it can be reused
2. Create a dedicated client-facing Resource Hub page with read-only, tenant-scoped access
3. Keep the existing admin Resource Hub unchanged for Vivacity Team
4. Update category paths to stay within `/client/*` namespace on client pages

### Changes

**1. `src/pages/ResourceHubDashboard.tsx`**
- Remove the `<DashboardLayout>` wrapper from the component's return
- Wrap it externally: create a new wrapper or update existing route to add DashboardLayout at the route level
- This prevents double-layout when the same component is loaded in client context

Specifically: rename the inner content to a standalone component (e.g., `ResourceHubContent`) that does NOT include any layout wrapper, then have `ResourceHubDashboard` import and wrap it in `DashboardLayout`.

**2. `src/pages/client/ClientResourceHubPage.tsx`** (new file)
- A dedicated client-facing Resource Hub page that:
  - Renders inside `ClientLayout` (via the wrapper)
  - Shows published resources only (read-only, no edit/upload controls)
  - Uses `/client/resource-hub/*` paths for category links (not `/resource-hub/*`)
  - Includes search and browse by category
  - Adds a "Request a resource" CTA button
  - Includes tenant-safe data access checklist as code comments

**3. `src/pages/client/ClientResourceHubWrapper.tsx`** (update)
- Change from loading `ResourceHubDashboard` to loading the new `ClientResourceHubPage`

**4. `src/types/resource.ts`** (update)
- Add a helper function or constant for client-prefixed category paths, so category links on client pages point to `/client/resource-hub/templates` etc. instead of `/resource-hub/templates`

**5. `src/App.tsx`** (update)
- Add client resource hub category sub-routes under `/client/resource-hub/*`
- Keep existing `/resource-hub/*` routes unchanged for Vivacity Team

**6. `docs/client-portal/data-access-checklist.md`** (update)
- Confirm/refine the Resource Hub entry with the tenant-scoping rules

### What stays unchanged
- All existing `/resource-hub/*` admin routes and `DashboardLayout` wrapping for Vivacity Team
- `useResources` hook internals (client page will filter for `is_published` only)
- Database tables and RLS policies (client reads published resources; no tenant join needed per the existing checklist)
- Sidebar navigation (`ClientSidebar` already points to `/client/resource-hub`)

### Technical detail

The key architectural fix is separating the layout responsibility:

```text
BEFORE (broken):
  ClientLayout > ClientResourceHubWrapper > ResourceHubDashboard > DashboardLayout > content
  (two sidebars, two topbars)

AFTER (correct):
  Client route:  ClientLayout > ClientResourceHubWrapper > ClientResourceHubPage > content
  Admin route:   DashboardLayout > ResourceHubDashboard > content
```

Files to create:
- `src/pages/client/ClientResourceHubPage.tsx`

Files to modify:
- `src/pages/client/ClientResourceHubWrapper.tsx` (point to new client page)
- `src/pages/ResourceHubDashboard.tsx` (extract content component to avoid layout nesting if reuse is needed, or simply leave it as-is since client now has its own page)
- `src/App.tsx` (add `/client/resource-hub/:category` sub-routes)
- `src/types/resource.ts` (add client path helper)
- `docs/client-portal/data-access-checklist.md` (confirm resource hub entry)

