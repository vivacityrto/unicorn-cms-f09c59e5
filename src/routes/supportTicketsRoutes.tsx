import { Route, Navigate, useParams } from "react-router-dom";

/** Redirect that keeps the ticket id, so old notification and bookmark links open the ticket, not the list. */
function RedirectKeepingId({ to }: { to: (id: string) => string }) {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? to(id) : "/support-tickets"} replace />;
}

/**
 * Legacy "Suggestion & Issue Register" links redirect into Tickets. The real
 * pages live in src/routes/dashboardRoutes.tsx (staff: /support-tickets,
 * /support-tickets/new, /support-tickets/:id) and src/routes/clientRoutes.tsx
 * (client portal). Ticket ids were preserved when tickets moved to the new
 * model, so /suggestions/<id> and /client/suggestions/<id> still land on the
 * right ticket.
 */
export const supportTicketsRoutes = (
  <>
    {/* Staff */}
    <Route path="/suggestions" element={<Navigate to="/support-tickets" replace />} />
    <Route path="/suggestions/new" element={<Navigate to="/support-tickets/new" replace />} />
    <Route path="/suggestions/:id" element={<RedirectKeepingId to={(id) => `/support-tickets/${id}`} />} />
    {/* Client portal */}
    <Route path="/client/suggestions" element={<Navigate to="/client/support-tickets" replace />} />
    <Route path="/client/suggestions/new" element={<Navigate to="/client/support-tickets" replace />} />
    <Route path="/client/suggestions/:id" element={<RedirectKeepingId to={(id) => `/client/support-tickets/${id}`} />} />
  </>
);
