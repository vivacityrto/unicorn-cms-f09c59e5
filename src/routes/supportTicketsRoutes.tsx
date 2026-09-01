import { lazy } from "react";
import { Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const NewSupportTicketPage = lazy(() => import("@/pages/NewSupportTicketPage"));
const SuggestionDetail = lazy(() => import("@/pages/SuggestionDetail"));

/**
 * Legacy "Suggestion & Issue Register" redirects into Support Tickets, plus
 * the two staff-side Support Tickets sub-routes that never became part of
 * the DashboardLayout nested route (docs/kb/reference/codebase-optimization-plan-2026-08-28.md,
 * P1.3). The bare /support-tickets route itself moved into
 * src/routes/dashboardRoutes.tsx alongside the rest of the staff shell;
 * client-portal support-tickets pages live in src/routes/clientRoutes.tsx.
 * Was previously split across three non-adjacent locations in App.tsx;
 * consolidated here as one route family (P1.2).
 */
export const supportTicketsRoutes = (
  <>
    <Route path="/support-tickets/new" element={<ProtectedRoute><NewSupportTicketPage /></ProtectedRoute>} />
    <Route path="/support-tickets/:id" element={<ProtectedRoute><SuggestionDetail /></ProtectedRoute>} />
    {/* Suggestion & Issue Register (legacy → redirect to Support Tickets) */}
    <Route path="/suggestions" element={<Navigate to="/support-tickets" replace />} />
    <Route path="/suggestions/new" element={<Navigate to="/support-tickets/new" replace />} />
    <Route path="/suggestions/:id" element={<ProtectedRoute><SuggestionDetail /></ProtectedRoute>} />
    {/* Client portal legacy redirects (destination routes live in clientRoutes.tsx) */}
    <Route path="/client/suggestions" element={<Navigate to="/client/support-tickets" replace />} />
    <Route path="/client/suggestions/new" element={<Navigate to="/client/support-tickets" replace />} />
    <Route path="/client/suggestions/:id" element={<Navigate to="/client/support-tickets" replace />} />
  </>
);
