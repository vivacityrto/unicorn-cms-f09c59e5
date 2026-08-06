# Audit: 2026-05-08 — client-packages-action-buttons-fix

**Trigger:** ad-hoc — two non-functional buttons on the client portal `/client/packages` page reported by Khian.
**Scope:** `PackageActionRow.tsx` (UI routing only). No database, no RLS, no other components touched.

## Findings

- **"Open Tasks" button routed to staff route** — `Link to` was `/tasks?package_instance_id=…`, which is the staff `TasksManagementWrapper` route. Client portal users have no access to it and were silently redirected to the homepage. Fixed to `/client/tasks?package_instance_id=…` (the correct client portal route).

- **"Messages CSC" button opened browser email popup** — button used a `mailto:` href backed by a Supabase `users.email` lookup via `useEffect`. This triggered the browser's "open mail client" popup, not in-app messaging. Fixed to a plain `Link to="/client/inbox?tab=messages"` navigating directly to the in-app Messages tab.

- **Dead code removed** — `managerEmail` useState, `useEffect` fetching `users.email`, `asChild`/`disabled`/`title` conditional logic, `mailto:` anchor, disabled `<span>` fallback, `supabase` import, and `useEffect`/`useState` imports all removed. `managerId` prop removed from the interface and component signature; corresponding removal also applied to the call site in `ClientPackagesPage.tsx` to keep the build green.

- **"Book consult" button** — untouched.

- Both bugs were week-1 placeholder stubs left with TODO comments; no regression — the buttons were never functional.

## KB changes shipped

- no changes

## Codebase observations (read-only)

- unicorn @ 4f25ac44: `PackageActionRow.tsx` updated by Lovable — both buttons now route correctly, dead code cleaned.

## Decisions

- n/a

## Open questions parked

- `package_instance_id` query param is passed to `/client/tasks` but `ClientTasksPage` does not yet filter by it. Tasks will load unfiltered. Accepted as out of scope for this fix; can be addressed when package-scoped task filtering is built.

## Tag

audit-2026-05-08-client-packages-action-buttons-fix