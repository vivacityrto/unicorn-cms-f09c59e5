# Fix React error #310 on BulkDocumentJobProgress

Purely a Rules of Hooks ordering fix in `src/pages/BulkDocumentJobProgress.tsx`. No logic changes, no other files touched.

## Change

Move the `leasedNow` `useMemo(...)` call up so it sits immediately after the existing `grouped` `useMemo` (which groups items by `tenant_id`), and **before** the three early-return guards:

1. `if (accessLoading || jobLoading) return (...)`
2. `if (!isVivacityStaff) return (...)`
3. `if (!job) return (...)`

`leasedNow` only depends on `items`, which is already defined (defaults to `[]`) above the guards, so relocating the hook is safe.

Everything derived from `leasedNow` that is not itself a hook — `activeItem`, `showActive`, `total`, `gCount`, and the rest of the plain `const` assignments in the current post-guard block — stays exactly where it is. Only the `useMemo` call moves.

## Why

The hook currently sits after conditional returns. On the initial render the component returns early (loading), so the hook isn't called. On the next render, guards clear and the hook runs — the hook count differs between renders and React throws minified error #310. Moving it above all early returns makes the hook count stable across every render.

## Out of scope

- No changes to queries, polling, RLS, edge functions, styling, or any other component.
- No changes to the `meeting_artifacts_select_tenant` finding still open from earlier.
