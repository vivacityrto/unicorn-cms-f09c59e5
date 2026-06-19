## People page — Staff Onboarding & Offboarding

### Files touched
1. `src/pages/admin/StaffEngagements.tsx` (new) — list page + new engagement dialog
2. `src/App.tsx` — lazy-import + protected route at `/admin/staff-engagements`
3. `src/components/DashboardLayout.tsx` — add "People" nav item to Administration, gated to Super Admin + Integrator

### Routing & nav
- Add lazy import `StaffEngagements` and a `<Route path="/admin/staff-engagements" element={<ProtectedRoute><DashboardLayout><StaffEngagements/></DashboardLayout></ProtectedRoute>} />` matching the surrounding admin route pattern.
- In `administrationMenuItems`, add `{ icon: UserPlus, label: "People", path: "/admin/staff-engagements", saOrIntegratorOnly: true }`.
- Extend `filteredAdminItems` filter: when `item.saOrIntegratorOnly`, return `isSuperAdmin || isIntegrator`. Existing section-level gate already shows Administration to SA/TL/Integrator, so the item appears for both target roles and stays hidden from Team Leader.
- Page-level access: `StaffEngagements` checks `isSuperAdmin || isIntegrator` from `useAuth`; otherwise renders an "Access denied" message (route is still wrapped in `ProtectedRoute`).

### People page
- Fetch `staff_engagements` ordered by `created_at desc` via `useQuery` + `supabase.from('staff_engagements').select('*')`.
- Header: H1 "People", subtitle "Manage staff onboarding and offboarding", right-aligned "New Engagement" button (opens shadcn `Dialog`).
- `Switch` labelled "Show cancelled" above the table (default off). When off, filter out `status = 'cancelled'`.
- shadcn `Table` with columns: Name, Role, Type, Status, Start Date, Created.
  - Type badge: Onboarding = cyan (brand primary), Offboarding = amber/orange.
  - Status badge mapping: `in_progress` → "In Progress" (blue), `pending_signoff` → "Pending Sign-Off" (amber), `completed` → "Completed" (green), `cancelled` → "Cancelled" (muted).
  - Dates formatted with `date-fns` `format(d, "dd MMMM yyyy")`.
  - Rows use `onClick={() => navigate(`/admin/staff-engagements/${row.id}`)}` with `cursor-pointer hover:bg-muted/50`.
- Empty state: muted "No engagements yet" row.

### New Engagement dialog
- shadcn `Dialog` triggered by header button. Form via `react-hook-form` + `zod`:
  - `person_name` (text, required)
  - `person_email` (email, required)
  - `role` (text, required — free text)
  - `engagement_type` — `RadioGroup` "Contractor" / "Employee" → `contractor` / `employee`
  - `checklist_type` — `RadioGroup` "Onboarding" / "Offboarding" → `onboarding` / `offboarding`
  - `start_date` — shadcn DatePicker (Popover + Calendar with `pointer-events-auto`). Label is dynamic: "First Day" for onboarding, "Last Day" for offboarding.
- Submit:
  - `supabase.auth.getUser()` → use `user.id` as `created_by`.
  - Insert payload explicitly maps `type: checklist_type` (DB column is `type`, not `checklist_type`):
    ```ts
    {
      person_name,
      person_email,
      role,
      engagement_type,
      type: checklist_type,
      start_date: ISO date,
      status: 'in_progress',
      created_by,
    }
    ```
  - On success: toast, close dialog, `queryClient.invalidateQueries(['staff_engagements'])`.
  - On error: toast error, keep dialog open.

### Out of scope
- Detail page at `/admin/staff-engagements/:id` (Prompt 4).
- No edits to any other files.