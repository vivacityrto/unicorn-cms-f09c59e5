Move the bulk membership certificate download route from `/admin/bulk-membership-certificates` to `/clients/bulk-membership-certificates` so CSC users are no longer blocked by the ProtectedRoute admin gate.

Changes (2 files):

1. `src/App.tsx`
   - Change `<Route path="/admin/bulk-membership-certificates" ...>` to `<Route path="/clients/bulk-membership-certificates" ...>`.

2. `src/components/DashboardLayout.tsx`
   - In `clientsMenuItems`, change the Bulk Cert Download entry's `path` from `"/admin/bulk-membership-certificates"` to `"/clients/bulk-membership-certificates"`.

No other files are modified.