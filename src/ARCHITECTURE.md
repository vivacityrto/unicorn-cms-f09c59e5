# Frontend architecture

Unicorn 2.0 is a Vite + React + TypeScript single-page frontend. The
application talks to hosted Supabase; route guards and server-side policies
remain the authorization boundary.

## Feature layering

- Routes and pages orchestrate navigation, query state, mutations, and page
  composition. For lifecycle administration, the page is
  `src/pages/admin/LifecycleChecklistsAdmin.tsx`.
- Data hooks own Supabase access and React Query state. The lifecycle data seam
  is `src/hooks/useLifecycleChecklists.ts`; it remains a compatibility seam for
  the existing page and is not a display-component dependency.
- Feature-local types are the UI contract. Lifecycle contracts live in
  `src/features/lifecycle/types.ts` and are derived from generated Supabase
  types rather than duplicated by consumers.
- Display components render supplied data and emit user intent through
  callbacks. The lifecycle grid and dialog under
  `src/components/admin/lifecycle/` do not fetch data, perform mutations, or
  decide authorization.

## Lifecycle pilot import convention

Lifecycle display components import contracts from
`@/features/lifecycle/types`. They must not import the lifecycle data hook;
the scoped ESLint rule in `eslint.config.js` guards this boundary. The page
may import the hook because it is the orchestration layer.

This is deliberately a pilot boundary, not a repository-wide abstraction.
Other features should adopt the pattern only after their own reachability,
behavior, and test evidence justify it.

## Authorization and tenants

Frontend visibility is not authorization. Route guards provide the client
navigation boundary, while Supabase policies and authorized server paths
enforce tenant and role access. This architecture note records those seams;
it does not change RBAC, RLS, schema, or production data.
