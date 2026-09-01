import { lazy } from "react";
import { Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const SupportTicketsWrapper = lazy(() => import("@/pages/SupportTicketsWrapper"));
const NewSupportTicketPage = lazy(() => import("@/pages/NewSupportTicketPage"));
const SuggestionDetail = lazy(() => import("@/pages/SuggestionDetail"));
const SupportTicketsPortalWrapper = lazy(() => import("@/pages/client/SupportTicketsPortalWrapper"));
const SupportTicketPortalDetailWrapper = lazy(() => import("@/pages/client/SupportTicketPortalDetailWrapper"));

/**
 * Support Tickets, plus the legacy "Suggestion & Issue Register" redirects
 * into it (staff and client portal). Was previously split across three
 * non-adjacent locations in App.tsx; consolidated here as one route family
 * (docs/kb/reference/codebase-optimization-plan-2026-08-28.md, P1.2).
 */
export const supportTicketsRoutes = (
  <>
    <Route path="/support-tickets" element={<ProtectedRoute><SupportTicketsWrapper /></ProtectedRoute>} />
    <Route path="/support-tickets/new" element={<ProtectedRoute><NewSupportTicketPage /></ProtectedRoute>} />
    <Route path="/support-tickets/:id" element={<ProtectedRoute><SuggestionDetail /></ProtectedRoute>} />
    {/* Suggestion & Issue Register (legacy → redirect to Support Tickets) */}
    <Route path="/suggestions" element={<Navigate to="/support-tickets" replace />} />
    <Route path="/suggestions/new" element={<Navigate to="/support-tickets/new" replace />} />
    <Route path="/suggestions/:id" element={<ProtectedRoute><SuggestionDetail /></ProtectedRoute>} />
    {/* Client portal */}
    <Route path="/client/support-tickets" element={<ProtectedRoute><SupportTicketsPortalWrapper /></ProtectedRoute>} />
    <Route path="/client/support-tickets/:id" element={<ProtectedRoute><SupportTicketPortalDetailWrapper /></ProtectedRoute>} />
    <Route path="/client/suggestions" element={<Navigate to="/client/support-tickets" replace />} />
    <Route path="/client/suggestions/new" element={<Navigate to="/client/support-tickets" replace />} />
    <Route path="/client/suggestions/:id" element={<Navigate to="/client/support-tickets" replace />} />
  </>
);
