## Phase 6 — Super Admin CRUD for Reporting Obligations

Build the management UI at `/admin/settings/reporting-obligations`, fully behind the existing `ProtectedRoute requireSuperAdmin` guard. No DB, edge function, or cron changes.

### Files to add
- `src/pages/admin/settings/ReportingObligations.tsx` — wraps `DashboardLayout`, page shell, header, "+ New Obligation" CTA, table.
- `src/components/admin/reporting-obligations/ObligationsTable.tsx` — table sorted by `sort_order, title`; columns: code, title, audience label, recurrence label, inline `is_active` Switch (optimistic), actions menu (Edit, Preview Recipients, Delete).
- `src/components/admin/reporting-obligations/ObligationFormDialog.tsx` — shared create/edit dialog.
- `src/components/admin/reporting-obligations/ObligationDeleteDialog.tsx` — confirmation modal (reuses `ConfirmDialog` from `@/components/ui/modals`).
- `src/components/admin/reporting-obligations/BroadcastPreviewDialog.tsx` — two-step preview + broadcast.
- `src/hooks/admin/use-reporting-obligations.ts` — React Query CRUD against `public.compliance_obligations` joined to `dd_obligation_audience` and `dd_obligation_recurrence`; plus dropdown hooks for the two lookup tables.
- `src/hooks/admin/use-broadcast-obligation.ts` — wraps `supabase.functions.invoke('generate-notifications', …)` for preview and broadcast modes.

### Wiring
- Register lazy import + route in `src/App.tsx`:
  ```tsx
  <Route path="/admin/settings/reporting-obligations"
    element={<ProtectedRoute requireSuperAdmin><ReportingObligations /></ProtectedRoute>} />
  ```
- Add a nav entry to `systemConfigMenuItems` in `src/components/DashboardLayout.tsx`:
  ```ts
  { icon: BellRing, label: "Reporting Obligations", path: "/admin/settings/reporting-obligations" }
  ```
  (the existing "SYSTEM CONFIG" section is the Configuration group; no new section created).

### Form fields (ObligationFormDialog)
| Field | Control | Notes |
|---|---|---|
| `code` | Input | required, unique (DB enforces) |
| `title` | Input | required |
| `description` | Textarea | required |
| `audience_id` | Select from `dd_obligation_audience` | required; `__none__` sentinel mapped to `undefined` |
| `recurrence_id` | Select from `dd_obligation_recurrence` | required; sentinel as above |
| `annual_month`, `annual_day` | Number inputs | visible only when selected recurrence `value === 'annual_fixed'` |
| `window_opens_month`, `window_opens_day` | Number inputs | visible only when selected recurrence `value === 'annual_window'` |
| `due_date` | Shadcn date picker | optional one-off override |
| `cta_label` | Input | required |
| `cta_url` | Input | required |
| `sort_order` | Number | default 100 |
| `is_active` | Switch | default true |
| `notification_message` | Textarea | optional; description used at send time if blank |
| `lead_times` | Comma-separated input parsed to `integer[]` | default `[30,14,7,1]`; positive ints only |

Conditional month/day blocks read the selected recurrence's `value` from the dropdown rows; recurrence rows are fetched alongside obligations.

### Broadcast flow
- Row action "Preview Recipients" → opens `BroadcastPreviewDialog`, fires `preview: true` immediately. Displays `tenant_count`, `user_count`, `sample_tenants` (≤10).
- Inside the dialog: "Send Broadcast" button is **disabled** until the preview response arrives in the current dialog session; clicking it fires `broadcast: true`, shows a success toast with `inserted` count, closes the dialog.
- Both calls use `supabase.functions.invoke('generate-notifications', { body: { scope:'reporting_obligations', obligation_id, preview|broadcast: true } })`, which automatically attaches the caller JWT (edge function enforces the super-admin gate already shipped in Phase 4).

### Conventions followed
- `DashboardLayout` shell, `Card`/`Tabs`/`Dialog`/`Switch` from `@/components/ui/*`, `toast` from `@/hooks/use-toast`, `ConfirmDialog` from `@/components/ui/modals` (matches `LifecycleChecklistsAdmin`).
- React Query for data + mutations with cache invalidation on success.
- Radix Select empty value via `__none__` sentinel.
- No new npm dependencies. No changes outside the new files, App.tsx route registration, and the single nav entry in `DashboardLayout.tsx`.

### Verification (manual after build)
1. `/admin/settings/reporting-obligations` loads only for Super Admin.
2. Create → edit → toggle active → delete an obligation succeeds; list refreshes.
3. Preview returns counts without inserting notifications.
4. Broadcast inserts notifications and they appear in a client's in-app inbox.
5. No regression in existing sidebar entries or Settings tabs.

### Out of scope
Client portal, Home page card, audit-log surfacing UI, scheduling toggles, bulk import/export.
