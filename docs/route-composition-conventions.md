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
