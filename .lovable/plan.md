## Scope (Option B)

Ship Steps 1 + 2 only. Step 3 (academy_user route/sidebar gating) is deferred to a follow-up once impersonation paths are validated.

## Changes

### 1. `src/types/resource.ts`
Remove the `training-webinars` entry from `RESOURCE_CATEGORIES`. Leaves the other six categories intact. The `category` string remains free-form on `Resource` so any historical row tagged `training-webinars` won't crash — it just won't get a quick-link card. (No DB migration; schema already done via MCP per prompt.)

### 2. `src/pages/client/ClientResourceHubPage.tsx`
Replace the dashboard body with a coming-soon hero state when there are no published resources. Keep the page header and "Request a Resource" button.

Logic:
- Use `useAllResources()` (already called) as the source of truth.
- While loading → show a light skeleton (reuse existing `Skeleton`).
- When `allResources.length === 0` → render a single hero card:
  - `Library` icon in a cyan-tinted circle
  - Heading: "Resource Hub is coming soon"
  - Body: "We're curating compliance templates, checklists, registers, audit tools, and how-to guides. Check back shortly — or let us know what you need most."
  - Primary CTA: existing "Request a Resource" button (reuse handler, just surface the same toast for now)
- When `allResources.length > 0` → render the existing search + categories + Recently Added + Most Popular layout (unchanged), minus the removed category card from step 1.

Remove the `training-webinars` entry from the local `categoryIcons` map for tidiness.

### 3. Step 3 follow-up (not built)
Add a backlog note in `.lovable/backlog.md`:
- Title: "Academy-only users: widen Calendar + Resource Hub access, restrict everything else"
- Body: surface `relationship_role` on `ClientTenantContext`, add academy-user gate in `ClientRouteGuard` and `ClientSidebar`, smoke-test via impersonation. References this prompt.

## Out of scope
- No changes to `ClientRouteGuard`, `ClientSidebar`, `ClientTenantContext`.
- No changes to `useResources` hook or any RLS.
- No changes to Calendar page.

## Acceptance
- `/client/resource-hub` with zero published rows shows the coming-soon hero and the "Request a Resource" button — no category grid, no empty Recently/Popular sections.
- Once a published resource exists, the page reverts to the full layout, and "Training & Webinars" no longer appears as a quick-link card.
- Backlog note captures the deferred academy-user access work.
