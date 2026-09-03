import { Route, Navigate } from "react-router-dom";

/**
 * Legacy "Suggestion & Issue Register" redirects into Support Tickets. The
 * bare /support-tickets route, /support-tickets/new, and /support-tickets/:id
 * (plus its /suggestions/:id alias) all moved into src/routes/dashboardRoutes.tsx
 * alongside the rest of the staff shell (docs/kb/reference/dashboard-direct-
 * layout-migration-plan-2026-09-01.md, PR 14); client-portal support-tickets
 * pages live in src/routes/clientRoutes.tsx. Was previously split across
 * three non-adjacent locations in App.tsx; consolidated here as one route
 * family (P1.2), then thinned down to just the redirects once the two real
 * pages joined the shared layout.
 */
export const supportTicketsRoutes = (
  <>
    {/* Suggestion & Issue Register (legacy → redirect to Support Tickets) */}
    <Route path="/suggestions" element={<Navigate to="/support-tickets" replace />} />
    <Route path="/suggestions/new" element={<Navigate to="/support-tickets/new" replace />} />
    {/* Client portal legacy redirects (destination routes live in clientRoutes.tsx) */}
    <Route path="/client/suggestions" element={<Navigate to="/client/support-tickets" replace />} />
    <Route path="/client/suggestions/new" element={<Navigate to="/client/support-tickets" replace />} />
    <Route path="/client/suggestions/:id" element={<Navigate to="/client/support-tickets" replace />} />
  </>
);
