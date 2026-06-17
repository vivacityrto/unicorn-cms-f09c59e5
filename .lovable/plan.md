# Phase 3 — Email Triage UI

Builds the staff-facing UI on top of the Phase 1 schema (`email_tickets`, `dd_email_ticket_*`) and the Phase 2 `handle-email-intake` Edge Function. No schema or backend changes in this phase.

## 1. Route & navigation

**`src/App.tsx`**
- Add a lazy import: `const EmailTriageWrapper = lazy(() => import("./pages/EmailTriageWrapper"))`.
- Register route `/email-triage` inside the existing `ProtectedRoute` + `Suspense` block, mirroring how `/team-inbox` is wired.

**`src/components/DashboardLayout.tsx` — WORK section**
- Add to `workMenuItems` (after `Inbox`):
  ```ts
  { icon: Mail, label: "Email Triage", path: "/email-triage", emailTriageStaffOnly: true }
  ```
- In `filteredWorkItems` (lines 231–238), extend the filter to handle the new flag. The gate uses the existing role helper rather than a new one — all five required roles (`Super Admin`, `Team Member`, `CSC`, `Integrator`, `BGT`) are already members of `VIVACITY_STAFF_ROLES`, plus `Team Leader` and `CET`. Per spec we must exclude `Team Leader` and `CET`, so we add a small local predicate:
  ```ts
  const EMAIL_TRIAGE_ROLES = new Set(['Super Admin','Team Member','CSC','Integrator','BGT']);
  const isEmailTriageStaff = EMAIL_TRIAGE_ROLES.has(userRole);
  ```
  and in the filter: `if ((item as any).emailTriageStaffOnly) return isEmailTriageStaff;`

This matches the existing `leadershipOnly` / `superAdminOnly` gating pattern exactly.

## 2. Page structure

**`src/pages/EmailTriageWrapper.tsx`** — mirrors `TeamInboxWrapper.tsx`: `DashboardLayout` shell + `<EmailTriagePage />`.

**`src/pages/EmailTriagePage.tsx`** — three `Tabs` (`triage` | `all` | `mine`) using the same shadcn `Tabs/TabsList/TabsTrigger/TabsContent` import pattern. Hosts the realtime subscription (see §5). Each tab renders its own table component:

- `src/components/email-triage/TriageQueueTab.tsx`
- `src/components/email-triage/AllTicketsTab.tsx`
- `src/components/email-triage/MyTicketsTab.tsx`
- `src/components/email-triage/TriageSidePanel.tsx`
- `src/components/email-triage/TicketBadges.tsx` (shared `CategoryBadge`, `StatusBadge`, `UrgentIcon`)

## 3. Tabs

**Tab 1 — Triage Queue**
- Query: `triage_status = 'untriaged'`, order `received_at desc`.
- Columns: received (relative + tooltip), sender (name + email), subject, urgent (red `AlertTriangle` from lucide if `urgent`).
- Row click → opens `TriageSidePanel` with the selected row.
- Empty state: "No items waiting for triage".

**Tab 2 — All Tickets**
- Query: all rows, order `received_at desc`, `limit 500` for v1.
- Columns: ticket #, category badge, sender name, subject, assignee (avatar initials + name resolved from the staff directory cache), status badge, response due (relative), SLA breach indicator.
- Row border: `border-l-4 border-destructive` if `sla_breached`; else `border-l-4 border-warning` if `response_due_at` is within 60 min and not breached; otherwise no left border. Colour classes come from the existing semantic tokens — no hex.
- Filter bar above the table: category / status / assignee `Select`s. Filtering runs client-side on the React Query result.
- Empty state: "No tickets".

**Tab 3 — My Tickets**
- Query: `assigned_to_user_id = auth.uid()` AND `status != 'closed'`, order `received_at desc`.
- Columns: ticket #, subject, category badge, status badge, response due.
- Empty state: "No tickets assigned to you".

## 4. Triage side panel

Uses the existing shadcn `Sheet` (`Sheet`, `SheetContent side="right"`, `SheetHeader`, `SheetTitle`) — same pattern other side panels in this codebase use. Width `sm:max-w-xl`.

Read-only header block: sender name, sender email, subject, received timestamp.
Scrollable body block (`max-h-[40vh] overflow-y-auto`): full `body_preview`.

Form fields:
- **Category** — `Select` populated from `dd_email_ticket_category` (live fetched via a tiny `useEmailTicketCategories` hook; value = `value`, label = `label`).
- **Urgent** — shadcn `Switch`.
- **Assign to** — `Select` populated from `useTriageStaffOptions()` (see §6).

Footer:
- **Cancel** button (closes sheet).
- **Mark Triaged** primary button — disabled until category + assignee chosen. On click runs the `useUpdateEmailTicket` mutation with payload:
  ```ts
  {
    triage_status: 'triaged',
    triaged_by: user.id,
    triaged_at: new Date().toISOString(),
    category,
    urgent,
    assigned_to_user_id,
    assigned_at: new Date().toISOString(),
  }
  ```
- On success: `sonner` toast "Ticket triaged", close the sheet, invalidate the three tab query keys (realtime will also fire, but explicit invalidation keeps the UX snappy).

## 5. Realtime

Inside `EmailTriagePage`, a single `useEffect`:
```ts
const channel = supabase
  .channel('email_tickets_triage')
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'email_tickets' },
      () => {
        queryClient.invalidateQueries({ queryKey: ['email-tickets'] });
      })
  .subscribe();
return () => { supabase.removeChannel(channel); };
```
All three tab hooks share the `['email-tickets', ...]` root key so one invalidation refreshes everything. Matches the codebase realtime convention (`useEffect` + `removeChannel` cleanup).

**Flag to verify before coding:** confirm `public.email_tickets` is in the `supabase_realtime` publication. If not, Phase 1 needs a one-line migration `ALTER PUBLICATION supabase_realtime ADD TABLE public.email_tickets;` — I will check and, if missing, add it as a tiny Phase 3 migration.

## 6. Hooks (`src/hooks/`)

- **`useEmailTickets.ts`** — exports `useTriageQueue()`, `useAllTickets()`, `useMyTickets()`. Each calls `supabase.from('email_tickets').select(...)` with its own filter and a distinct query key under the `['email-tickets', <tab>]` namespace so they cache independently while still sharing the root for bulk invalidation.
- **`useTriageStaffOptions.ts`** — React Query, queryKey `['triage-staff']`. Fetches from `public.users` selecting `user_uuid, first_name, last_name, avatar_url, unicorn_role` where `unicorn_role IN ('Super Admin','Team Member','CSC','Integrator','BGT')` AND `disabled = false` AND `archived = false`. Display name = `[first_name, last_name].filter(Boolean).join(' ')` falling back to email. (Confirmed `public.users` exposes `first_name` / `last_name` / `avatar_url` — same fields `useVivacityTeamUsers` uses.)
- **`useEmailTicketCategories.ts`** — fetches active rows from `dd_email_ticket_category`, cached with `QUERY_STALE_TIMES.STATIC`.
- **`useUpdateEmailTicket.ts`** — `useMutation` performing a single `update().eq('id', id)` on `email_tickets`; on success invalidates `['email-tickets']`.

All hooks use the singleton client from `@/integrations/supabase/client` and follow the existing `useQuery` / `QUERY_STALE_TIMES` conventions.

## 7. Styling & badges

`TicketBadges.tsx` exposes:
- `CategoryBadge` — `Badge variant="secondary"` with class maps keyed off the `value` from `dd_email_ticket_category`. Suggested mapping using existing semantic tokens (no hex):
  - `lead` → `bg-blue-500/10 text-blue-700 dark:text-blue-300`
  - `client` → `bg-green-500/10 text-green-700 dark:text-green-300`
  - `tech` → `bg-purple-500/10 text-purple-700 dark:text-purple-300`
  - `billing` → `bg-amber-500/10 text-amber-700 dark:text-amber-300`
  - `general` → `bg-muted text-muted-foreground`
- `StatusBadge` — similar map for `dd_email_ticket_status` values.
- `UrgentIcon` — `AlertTriangle` in `text-destructive`, rendered inline next to subject when `urgent = true`.

No hardcoded brand hexes; relies on Tailwind palette steps + semantic tokens already in use across the app.

## 8. Acceptance checks (before declaring done)

1. Nav item appears for the 5 specified roles and is hidden for everyone else (including Team Leader, CET, Admin, General User, clients).
2. `/email-triage` renders three tabs; each tab shows correct empty state when no rows match.
3. Triage Queue row click opens side panel; Mark Triaged updates the row, removes it from the queue, and the same change appears in All Tickets without a manual refresh (realtime).
4. SLA borders render at the right times (manual check with a fixture row at +30 min and a `sla_breached=true` row).
5. Unauthenticated access to `/email-triage` redirects via `ProtectedRoute`.

## Items I will verify in code before writing

- `public.email_tickets` is in `supabase_realtime` publication (add migration if missing — single `ALTER PUBLICATION`).
- Exact column name on `public.users` for archived flag (`archived` vs `is_archived`) and that `disabled` exists — adjust the staff hook filter accordingly.
- Whether `dd_email_ticket_category.value` keys match the lead/client/tech/billing/general assumption above; if seed values differ, the badge map will be keyed off the actual seeded values rather than added speculatively.

No other behaviour will change. Once you approve, I'll implement in this order: hooks → side panel → tabs → page/wrapper → route + nav entry → realtime verification.
