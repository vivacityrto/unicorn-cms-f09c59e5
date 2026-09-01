# Route Composition Conventions for Unicorn 2.0

> **Governance Document** – All current and future Client Portal and Academy
> pages must follow these conventions. Read this before adding any new page
> under `/client/*` or `/academy/*`.

## The rule

**A new Client Portal page goes in `src/routes/clientRoutes.tsx`. A new
Academy page goes in `src/routes/academyRoutes.tsx`.** Add it as a child
`<Route>` of the existing nested layout route in that file, pointing at a
lazy-loaded page component. Do **not** create a new `*Wrapper.tsx` file that
imports `ClientLayout` or `AcademyLayout` and mounts it around the page --
that per-page-wrapper pattern existed before 1 September 2026 and was
deliberately retired.

```tsx
// src/routes/clientRoutes.tsx
const MyNewFeaturePage = lazy(() => import("@/pages/client/MyNewFeaturePage"));

export const clientLayoutRoutes = (
  <Route path="/client" element={<ProtectedRoute><ClientLayoutRoute /></ProtectedRoute>}>
    {/* ...existing children... */}
    <Route path="my-new-feature" element={<MyNewFeaturePage />} />
  </Route>
);
```

`MyNewFeaturePage` itself should contain only the page's own content -- no
`<ClientLayout>`/`<AcademyLayout>` wrapping, no sidebar/topbar/footer markup.
The layout is provided once by the shared parent route.

## Why this exists

Before this convention, every Client Portal and Academy page had its own
`*Wrapper.tsx` file that individually mounted `ClientLayout`/`AcademyLayout`
around the page. Because each page was a separate top-level route, navigating
between any two client-portal (or Academy) pages fully unmounted and
remounted the entire layout on every click: the sidebar always reset open,
collapsed menu sections reset, a live Supabase realtime channel
(`client-inbox-notifier`) disconnected and reconnected, the Ask Viv chat
panel force-closed, and a tenant/access loading spinner flashed between
pages that had already loaded it once.

On 1 September 2026 this was replaced with React Router's nested
layout-route pattern: one parent `<Route>` owns the layout and guard, and
child routes only swap the page content via `<Outlet/>`. The layout now
mounts once per Client Portal or Academy visit, not once per page. See
`src/routes/clientRoutes.tsx` and `src/routes/academyRoutes.tsx` for the
current, working implementation -- they are the canonical example, not this
document's code snippet above.

## What NOT to do

- **Do not** create `src/pages/client/MyNewFeatureWrapper.tsx` that does
  `<ClientLayout><MyNewFeaturePage /></ClientLayout>`. This reintroduces the
  exact per-page remount this convention retired, and silently breaks
  layout-state persistence for every other client-portal page too (the
  layout would remount whenever the user navigates to or from your new page).
- **Do not** import `ClientLayout` or `AcademyLayout` directly into a page
  component. If a page needs to be reachable outside the client portal or
  Academy shell (rare), that's a design decision to flag explicitly, not a
  default.
- **Do not** register the new route directly in `src/App.tsx`. `App.tsx`
  only holds the top-level `{clientLayoutRoutes}` / `{academyLayoutRoutes}`
  references, plus route families that haven't been extracted into their own
  module.

## Known exceptions (as of 1 September 2026)

Not every page under `/client/*` is a child of the nested layout route yet.
Three Academy pages that predate this convention still fetch their own data
and wrap `AcademyLayout` internally inside the page component: the Academy
courses list, certificates, and workbooks pages, plus the events/community
pages and the three PDP pages (`src/pages/academy/**`). These still
remount `AcademyLayout` on every navigation to/from them -- a known,
pre-existing gap, not something a new feature should copy. If you're adding
a new Academy page, follow the rule above (nested route in
`academyRoutes.tsx`), not this legacy pattern.

## The staff Dashboard shell: multiple guard tiers, not one

Client Portal and Academy each need exactly one guard (`ProtectedRoute` with
no special props), so one parent route per portal is enough. The staff
`DashboardLayout` shell is different: routes under it span several distinct
authorization tiers -- plain `ProtectedRoute` (location-sensitive: different
rules for `/admin/*`, `/eos/*`, unknown staff routes, and a handful of
client-safe paths), `requireSuperAdmin`, `allowedRoles={ACADEMY_BUILDER_ROLES}`
(Team Leader/Integrator/CSC, SuperAdmin implicitly included), and
`allowVivacityTeam` (broadens an otherwise-admin-only route to any internal
staff member). A single parent route with the guard hoisted to it cannot
represent more than one of these at a time.

**The rule for Dashboard pages:** `src/routes/dashboardRoutes.tsx` has one
sibling parent `<Route>` per guard tier actually in use, each independently
guarding its own copy of the shared lazy `DashboardLayoutRoute`:

```tsx
export const dashboardLayoutRoutes = (
  <>
    <Route element={<ProtectedRoute requireSuperAdmin><DashboardLayoutRoute /></ProtectedRoute>}>
      {/* SuperAdmin-only pages */}
    </Route>
    <Route element={<ProtectedRoute><DashboardLayoutRoute /></ProtectedRoute>}>
      {/* plain-tier pages -- the large majority */}
    </Route>
  </>
);
```

A new SuperAdmin-only staff page is a child of the `requireSuperAdmin`
sibling group, never a child of the plain group with its own extra
`<ProtectedRoute requireSuperAdmin>` wrapped around just that one route --
that ordering was tried once (PR #489), found unsafe, and corrected in PR
#490: a stricter guard nested *inside* an already-authorized plain parent
mounts the shell (sidebar, Ask Viv, realtime subscriptions) for any
authenticated staff member before the inner guard's redirect fires. The
guard that decides whether the shell mounts must sit **above**
`DashboardLayoutRoute`, never below it.

Crossing between guard tiers remounts the layout -- persistence is only
guaranteed for navigation within the same tier. This is an accepted,
documented tradeoff (see `dashboard-direct-layout-migration-plan-2026-09-01.md`
in `docs/kb/reference/`), not a bug to silently work around by weakening a
guard to fit everything under one parent.

If a new staff page needs `allowedRoles` or `allowVivacityTeam` and no
sibling group for that exact tier exists yet in `dashboardRoutes.tsx`, that's
a signal to create one (mirroring the pattern above), not to bend an
existing tier's semantics to fit.

## If you're an AI coding tool (Lovable, Claude Code, Cursor, Codex) reading this

When asked to add a new page to the Client Portal or Academy (for example, "a
new page like Regulatory Updates" or "a new dashboard tab"):

1. Create the page component under `src/pages/client/` (or
   `src/pages/academy/` for a genuinely Academy-only page) with no layout
   wrapping -- just the page's own content.
2. Add one `<Route>` line as a child of the existing nested layout route in
   `src/routes/clientRoutes.tsx` or `src/routes/academyRoutes.tsx`.
3. Do not touch `ClientLayout.tsx`, `AcademyLayout.tsx`,
   `ClientLayoutRoute.tsx`, or `AcademyLayoutRoute.tsx` unless the task is
   specifically about the shared layout shell itself.
4. If the new page needs guard behaviour stricter than plain
   `ProtectedRoute` (e.g. SuperAdmin-only), that's a signal it may not belong
   inside the shared client/academy layout route at all -- flag it rather
   than guessing.
5. For a new staff page (reachable from `DashboardLayout`'s sidebar, not the
   client portal or Academy), see "The staff Dashboard shell" section above
   instead -- it follows the same nested-route principle but needs a sibling
   guard-tier group, not a single shared parent.
