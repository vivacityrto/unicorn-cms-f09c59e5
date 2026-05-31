In `src/components/DashboardLayout.tsx`:

1. Add `Send` to the `lucide-react` import on line 2.
2. Insert a new entry into `administrationMenuItems` immediately after the "Manage Invites" item:
   `{ icon: Send, label: "Cohort Sender", path: "/admin/cohort-sender", superAdminOnly: true }`

No other nav items, layout, or logic will be changed. The route is already registered in `App.tsx`.