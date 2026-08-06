# KPI Module — Remaining Implementation Plan

> **Created:** 24 June 2026
> **Status:** In progress
> **Context:** Database schema complete (Phases 1–7). QA account hiding shipped.
> **What's missing:** Navigation, email log UI, task system UI, ticket system UI, QA test accounts.
> **Protocol:** All Lovable prompts must use plan mode ON before approving implementation.

> **⚠ DEPRECATED (confirmed by Carl, 2 July 2026).** Superseded by the
> "kpi-v2" rebuild — see the deprecation note in `kpi-module.md`.
> `/my/kpi` and `/admin/kpi-review` (referenced throughout this plan)
> are both deprecated/dead; the live route is `/kpi` (`KpiPage.tsx`).
> The remaining-work items below (email log UI, task/ticket system UI,
> `useKpiAccess` fix) describe the v1 module and should not be picked
> up as-is without first confirming against current `/kpi` (kpi-v2)
> behaviour. Retained for historical context only.

---

## Current state — what's built vs what's missing

### Built (database + backend)
- All `dd_kpi_*` lookup tables seeded
- `kpi_email_log`, `kpi_tasks`, `kpi_tickets`, `kpi_ticket_comms`, `kpi_reviews`, `kpi_review_signoffs`, `kpi_dev_milestones` tables with RLS
- `v_kpi_csc_summary`, `v_kpi_cst_summary`, `v_kpi_dev_summary` views (SECURITY INVOKER)
- `compute_kpi_overall_status()` and `upsert_kpi_review()` RPCs
- `is_kpi_reviewer_safe()` helper (checks `users.kpi_role = 'reviewer'`)
- `kpi-email-log-sync` edge function
- `OutlookInboxBrowser` extended with `folder` prop
- `useKpiEmailLog` hook (exists but not wired to UI)
- `kpi_pod` column on `public.users` for QA account hiding
- RPC + 14 direct query QA filters applied

### Built (UI — partial)
- `/my/kpi` route and `MyKpiDashboardPage.tsx` — exists but no sidebar link
- `/admin/kpi-review` route and `KpiReviewerPage.tsx`
- `/admin/kpi-overview` route and `KpiOverviewPage.tsx`
- `KpiDashboard.tsx` — shows KPI summary percentages from views
- `KpiReviewPanel.tsx` — review form with auto-computed status + sign-off
- `MyKpiSignOffSection.tsx` — staff sign-off widget on `/my/kpi`
- `KpiStaffSelector.tsx` — reviewer staff picker with QA badge

### NOT built yet
- Sidebar navigation entry (nobody can find the feature)
- `useKpiAccess` bug — checks `user_roles` instead of `users.kpi_role` (Nova locked out)
- Email log UI (Outlook connect CTA + email table + Log button)
- Task system UI (assign, my tasks, tasks I've assigned)
- Ticket system UI (raise ticket, ticket board, ticket detail + comms touchpoints)
- QA test accounts

---

## Prompt A — Fix `useKpiAccess` bug (send first — Nova is locked out)

**Priority: BLOCKER. Nova cannot access /admin/kpi-review until this is fixed.**

```
In src/hooks/useKpiAccess.tsx, the isReviewer check currently queries
user_roles for role = 'kpi_reviewer'. This is incorrect — reviewer
access is stored as users.kpi_role = 'reviewer' on the profile.

Fix: rewrite isReviewer to check profile?.kpi_role === 'reviewer'
using the profile already loaded from useAuth.

No DB changes needed. One line change.
```

**Verify:** Nova can access `/admin/kpi-review` and `/admin/kpi-overview`.

---

## Prompt B — Sidebar navigation

```
Add KPI entries to the EOS section of the sidebar in
src/components/DashboardLayout.tsx.

Rules:
- Show "My KPI" → /my/kpi for any user where profile.kpi_role is
  set (csc_consultant, cst_assistant, developer, reviewer).
- Additionally show "KPI Review" → /admin/kpi-review and
  "KPI Overview" → /admin/kpi-overview for users where
  useKpiAccess().canViewAnyStaff is true (reviewer or SuperAdmin).
- Users with no kpi_role set see no KPI menu items.

Use the same nav item pattern as existing EOS sidebar entries.
```

**Verify:** Each role sees the correct nav items. Staff with no `kpi_role` see nothing.

---

## Prompt C — Email log UI

**Applies to: CSC Consultant and CST Assistant dashboards**

```
In src/components/kpi/KpiDashboard.tsx (or a new child component),
add an Email Log section below the KPI summary pills for users with
kpi_role = 'csc_consultant' or 'cst_assistant'.

Two states:

STATE 1 — Outlook not connected
(no Microsoft row in oauth_tokens for this user)
Show a full-width CTA:
- Icon, heading: "Connect your Outlook to start logging"
- Sub: "Once connected, log email response times from your inbox.
  One-time setup."
- Button: "Connect Outlook" — initiates the existing Microsoft
  OAuth flow (same flow used by the Linked Emails feature)

STATE 2 — Outlook connected
Show the email log table using useKpiEmailLog hook:
- Columns: Received, Replied, Response time, SLA (✓ Met / ✗ Missed),
  Type (General email / Client message)
- Sort: received_at descending
- Header action button: "+ Log a response"

"+ Log a response" opens the OutlookInboxBrowser (folder='inbox')
in a right-side sheet/drawer. Staff selects the email they received.
Then the drawer switches to OutlookInboxBrowser (folder='sent') so
they can select their sent reply. On confirm, call
kpi-email-log-sync to write the entry. Close the drawer and
refresh the table.

The email_type field (general_email vs client_message) should be
selectable before confirming — a simple toggle: "General email" or
"Client message". Default to "General email".
```

**Verify:** Connect Outlook CTA appears when no oauth_token. Log a response flow opens inbox then sent items. Entry appears in table. SLA indicator is correct.

---

## Prompt D — Task system UI

**Three views: My tasks, Tasks I've assigned, Assign a task form**

```
Build the task management UI. Tasks use the kpi_tasks table.

Add this section to src/components/kpi/KpiDashboard.tsx (or a
dedicated KpiTasksSection component) visible for ALL kpi roles.

PART 1 — "Tasks assigned to me"
List all kpi_tasks where owner_user_id = current user, ordered:
- Overdue pending tasks first (due_at < now AND status = 'pending')
- Pending tasks (status = 'pending', due_at >= now)
- Completed tasks (status != 'pending') — collapsed by default,
  expandable

Each pending task row shows:
- Task name
- Assigned by (look up full_name from users)
- Due date — normal if > 2 days away, amber if <= 2 days, red if
  overdue
- Three action buttons: "Done on time" | "Rectified" | "Delayed"

Clicking an action button updates kpi_tasks.status and sets
completed_at = now(). Status is locked after marking — no undo.

Completed task rows show the task name, who assigned it, and the
status badge (Done on time / Rectified / Delayed). Read-only.

PART 2 — "Tasks I've assigned"
List all kpi_tasks where assigned_by = current user.
- Shows assignee avatar/name, task name, due date, current status
- Read-only — assigner cannot mark tasks on behalf of assignee
- Overdue + delayed tasks highlighted in the same colour scheme

PART 3 — "Assign a task" form
A button "+ Assign a task" visible on all role dashboards opens
a sheet/dialog with:
- Task name (required, text input)
- Assign to (required, dropdown of all internal Vivacity staff
  with kpi_role set, filtered with .neq('kpi_pod', 'qa') for
  non-QA views — use existing KpiStaffSelector pattern but for
  all roles, not filtered by kpi_role)
- Deadline (required, date picker)
- Description (optional, textarea)
- Cancel / Assign task buttons

On submit, INSERT into kpi_tasks with owner_user_id = selected
user, assigned_by = current user, status = 'pending'.
```

**Verify:**
- Task appears in assignee's "Tasks assigned to me" immediately after creation
- Appears in assigner's "Tasks I've assigned" view
- Status buttons lock after use
- Overdue tasks appear in red
- Assigner cannot mark tasks on behalf of assignee

---

## Prompt E — Ticket system UI

**Two surfaces: Ticket board (Nova/AJ/Ezel) + Ticket detail (Developer)**

```
Build the ticket management UI using kpi_tickets and
kpi_ticket_comms tables.

SURFACE 1 — Ticket board
Add a new route /admin/kpi-tickets (gated to canViewAnyStaff) and
add it to the KPI sidebar nav for reviewers/SuperAdmins.

Show a list of all kpi_tickets ordered by opened_at descending.
Each row shows: ticket_number, title, platform badge (Unicorn CMS
/ ComplyHub AI), priority badge (Critical/High/Standard),
status badge, assigned developer name, opened_at.

Filter tabs: All | Carl | Khian | Rhald (by assigned_to user)

"+ Raise a ticket" button opens a sheet with:
- Platform: dropdown (Unicorn CMS / ComplyHub AI)
- Priority: dropdown (Critical / High / Standard)
  — Critical shows a red warning: "First response required within
    2 hours. Nova and Angela will be notified."
- Subject: text input (required)
- Description: textarea (required)
- Assign to: dropdown filtered to users with kpi_role = 'developer'
  and .neq('kpi_pod', 'qa')

On submit, INSERT into kpi_tickets with status = 'received',
opened_at = now(), auto-generate ticket_number as
UNI-YYYY-NNNN (Unicorn) or CHA-YYYY-NNNN (ComplyHub AI).

SURFACE 2 — Ticket detail (Developer view)
In src/components/kpi/KpiDashboard.tsx for developer role,
show the ticket queue: all kpi_tickets where
assigned_to = current user, ordered by opened_at descending.

Each ticket row is clickable. Clicking expands an inline panel
below the row (accordion) showing:

A. Full ticket info (title, description, platform, priority,
   raised by, opened at)

B. Status controls — buttons to move ticket through:
   Received → Under Review → In Progress → Solved
   Current status is highlighted. "→ Solved" button available
   when In Progress. Reopening (Solved → In Progress) also
   available.

C. Communication touchpoints — the 4 mandatory comms for KPI 3.
   Show as a checklist. For each touchpoint:

   1. Acknowledged receipt (required within 2 hours of ticket raised)
   2. In progress notification (required within 12 hours)
   3. Reopened notification (only if ticket has been reopened)
   4. Resolution confirmation (at time of resolution)

   Each row shows:
   - Green (done): touchpoint name, timestamp logged, time taken
   - Amber (pending, window open): name, window closing time,
     "Log now" button
   - Grey (not applicable yet or window not open)

   "Log now" opens a small confirm dialog:
   "Confirm you have sent this communication to the requester via
   Slack or email." → On confirm, INSERT into kpi_ticket_comms
   with comm_type, occurred_at = now(), author_user_id = current user.
```

**Verify:**
- Nova can raise a ticket from /admin/kpi-tickets
- Ticket appears in assigned developer's queue on /my/kpi
- Developer can update status
- Comms touchpoints show correct state (green/amber/grey)
- "Log now" records the touchpoint with timestamp
- KPI 3 metric updates when comms are logged

---

## Step F — Create QA test accounts (manual, done by Carl)

1. Use the Unicorn invite flow to create three accounts:
   - `carl+csc@vivacity.com.au`
   - `carl+cst@vivacity.com.au`
   - `carl+reviewer@vivacity.com.au`

2. Once created, run in Supabase SQL editor:

```sql
UPDATE public.users SET kpi_role = 'csc_consultant', kpi_pod = 'qa'
 WHERE email = 'carl+csc@vivacity.com.au';

UPDATE public.users SET kpi_role = 'cst_assistant', kpi_pod = 'qa'
 WHERE email = 'carl+cst@vivacity.com.au';

UPDATE public.users SET kpi_role = 'reviewer', kpi_pod = 'qa'
 WHERE email = 'carl+reviewer@vivacity.com.au';
```

3. Set up three browser profiles — each logged into one test account.

---

## Step G — QA test checklist (run after all prompts shipped)

### CSC test account (`carl+csc`)
- [ ] Sees "My KPI" in EOS sidebar
- [ ] `/my/kpi` loads CSC dashboard with 3 KPI pills
- [ ] "Connect Outlook" CTA appears in email log section
- [ ] Outlook OAuth flow completes (use real Microsoft account or skip)
- [ ] "Tasks assigned to me" shows empty state correctly
- [ ] "Tasks I've assigned" shows empty state correctly
- [ ] "Assign a task" form works — assigns to another user
- [ ] Cannot access `/admin/kpi-review` or `/admin/kpi-tickets`
- [ ] Does NOT appear in staff directory or note assignee dropdowns

### CST test account (`carl+cst`)
- [ ] Sees "My KPI" in sidebar
- [ ] SLA 1, SLA 2, Tasks pills appear
- [ ] Email log section shows (same Outlook flow as CSC)
- [ ] Task list shows tasks assigned to this account
- [ ] Action buttons (Done on time / Rectified / Delayed) work
- [ ] Cannot access reviewer pages

### Reviewer test account (`carl+reviewer`)
- [ ] Sees "My KPI" + "KPI Review" + "KPI Overview" in sidebar
- [ ] `/admin/kpi-review` loads with staff selector
- [ ] Can select a staff member and see their dashboard
- [ ] Can create a review, add notes, initiate sign-off
- [ ] Can sign off as reviewer
- [ ] `/admin/kpi-tickets` loads, can raise a ticket
- [ ] Does NOT have a personal KPI dashboard (no pills, no tasks)

### Developer (Carl's own account)
- [ ] `/my/kpi` loads developer dashboard
- [ ] Rocks pull from EOS (KPI 5 shows in quarterly view)
- [ ] Ticket queue is visible
- [ ] Can expand a ticket and update status
- [ ] Can log communication touchpoints
- [ ] Cannot access `/admin/kpi-review` (unless also SuperAdmin)

---

## Order of execution

| # | Step | Who | Blocker for |
|---|---|---|---|
| A | Fix useKpiAccess bug | Lovable | Nova can't access reviewer pages |
| B | Sidebar navigation | Lovable | Nobody can find the feature |
| C | Email log UI | Lovable | CSC + CST email SLA KPIs |
| D | Task system UI | Lovable | CST KPI 3, all role task management |
| E | Ticket system UI | Lovable | Dev KPIs 1–4, 6 |
| F | Create QA test accounts | Carl | QA testing |
| G | QA test checklist | Carl | Sign-off and go-live |

Prompts C, D, and E can be sent to Lovable in any order — they're
independent. A and B should go first.
