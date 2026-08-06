# Unicorn 2.0 — Main Dashboard Overhaul Lovable Prompts

**Module:** Main Dashboard (replaces `/dashboard` for Vivacity staff)
**Source spec:** Nova Canto, VCC-PLAT-SPEC-001 v1.0 — adapted against real codebase/data findings, see [dashboard-overhaul-mockup.md](../reference/dashboard-overhaul-mockup.md) for the full analysis and formulas.
**Run order:** Sequential. Each prompt assumes the previous one shipped clean.
**Last reviewed against codebase:** 2026-07-03 (`unicorn-cms-f09c59e5` HEAD `89aefd4e`)
**Schema changes required:** **none.** Every prompt below reads exclusively from existing tables/views. If Lovable proposes adding a table, column, enum, or RLS policy at any point, **stop** — that triggers the "Lovable production DB change" workflow in the root `CLAUDE.md` and needs the audit/plan-mode ritual, not a straight prompt.

---

## Decisions locked in before drafting (do not re-litigate these in Lovable)

| # | Decision |
|---|---|
| 1 | New dashboard is **internal Vivacity staff only** — not shown to client-portal roles. |
| 2 | The current `/dashboard` (Triage Dashboard) is **not deleted or hidden** — it gets a permanent nav item of its own ("Triage Dashboard"). Full existing sidebar (EOS suite, Academy Builder, Resource Management, System Config, etc.) stays exactly as-is; Nova's simplified nav sketch is not adopted. |
| 3 | "Team Messages" panel → renamed **"Recent Client Broadcasts"**, sourced from the Communications module's `broadcast_campaigns` (staff→client bulk announcements). There is no staff-to-staff chat feature in the schema. |
| 4 | Client Health donut uses the **existing stage-health system**, not a new metric — `worst_stage_health_status` relabelled healthy→Excellent, monitoring→Good, at_risk→At Risk, critical→Critical. |
| 5 | KPI mini panel **reuses `/kpi`'s existing role logic verbatim** (`profile.kpi_role`) — condensed `CscKpiCards`/`AssistantKpiCards`/`DeveloperPlaceholder`, not a generic fixed list. |
| 6 | Task summary cards (Overdue / Due Today / Tasks Overview) **mirror `/tasks` (`TasksManagement.tsx`) exactly** — same three-table union, same per-user scoping. Do not invent a narrower or different definition. |
| 7 | Rocks panel shows **status, not a % progress bar** — `eos_rocks.completion_percentage` is 0 on every real row in prod; a progress bar built from it would be fake. |
| 8 | Everything is scoped to **the logged-in user** (their assigned clients, their tasks, their KPI role, their calendar) — this is a personal landing page, not a fixed org-wide report. |

---

## Already built — do not rebuild (this is the "be surgical" section)

Nova's spec was written without visibility into the codebase, so it re-describes several things that already exist, globally, on every page. `DashboardLayout.tsx` wraps every route's content with `<TopBar />` and `<UtilityFooter />` (see `src/components/DashboardLayout.tsx` lines 655–665). Concretely:

- **Logos** — `TopBar.tsx` already renders the Unicorn 2.0 logo + Vivacity logo side by side, top-left, on every page. Nova's "Top Navigation Bar → LEFT: Unicorn CMS logo + Vivacity logo" is already shipped. Do not add a second logo lockup inside the new dashboard page.
- **Search** — `TopBar` already has a `showSearch` prop (currently unused, defaults off). If a global search box is wanted on the dashboard specifically, that's a one-line prop change in `DashboardLayout.tsx` for the `/dashboard` route only — not a new search UI to build. Skip this for now unless asked; not in scope for the prompts below.
- **Notification bell** — `TopBar` already renders `<NotificationDropdown />`, which uses the real `useNotifications()` hook (real unread count, mark-as-read, filtering by type) on every page already. Nothing to build. Metric card wording that references "unread notifications" should just be aware this already exists elsewhere — don't duplicate a second bell.
- **User avatar / profile menu** — `TopBar` already has a full avatar dropdown (photo/initials, name, email, role badge, Profile Settings link, Sign Out). Nothing to build.
- **Footer bar** — `UtilityFooter.tsx` already renders, on every page: active tenant name, role badge, **"Session started {time}"** (already computed on mount, Sydney timezone), and right-aligned links for **Help Centre, System Status, Release Notes** — this is Nova's entire footer spec, already shipped, word-for-word matching two of the three links. The one difference: Nova's mockup shows "Integrator: Nova Canto" on the left instead of tenant/role — that reads like a label from whatever tool she used to build the mockup, not a real product requirement, and it wouldn't make sense hardcoded into a footer shared by every page and every user. **Drop it. Don't add it anywhere.** The existing footer already covers the real underlying need (session context + support links).

**Net effect: the entire "TOP NAVIGATION BAR" and "FOOTER BAR" sections of Nova's spec require zero new work.** The only genuinely new page-level content is the "Welcome back, {name}!" heading + subtext + "+ New Task" button, which don't exist anywhere yet and belong inside the new dashboard page's own content area (not the shared `TopBar`/`UtilityFooter`, which stay untouched).

---

## Codebase facts (verified against HEAD — read before editing these prompts)

| Fact | Detail |
|---|---|
| Router | React Router v6, single route file `src/App.tsx` (routes ~line 268–1189), all pages lazy-loaded via `lazy()`/`Suspense`. |
| Current dashboard | `src/pages/Dashboard.tsx`, route `/dashboard`. Staff-only (`isVivacityStaffRole(profile?.unicorn_role)`); non-staff roles redirect to `/client/home`. Renders `OverloadBanner`, `StaffOnboardingBanner`, `TodaysFocusSection`, `AttentionRankingSection`, `PriorityInboxPanel`, `LabourEfficiencyPanel`, `RiskClusterSnapshot`, `ExpandablePortfolioSection`, `TenantDrawer`. Backed by `useDashboardTriage()` (`src/hooks/useDashboardTriage.ts`). |
| Sidebar | `src/components/DashboardLayout.tsx`. WORK group at lines ~30–43. Nav items are hardcoded arrays in this file — there is no separate nav config for the staff sidebar. |
| Auth/profile | `useAuth()` (`src/hooks/useAuth.tsx`) exposes `profile.user_uuid`, `profile.kpi_role`, `profile.unicorn_role`, `profile.first_name`, `profile.email`. |
| Global chrome (already shipped) | `src/components/layout/TopBar.tsx` — logos, breadcrumbs/page title, optional search, `NotificationDropdown`, avatar/profile menu. `src/components/layout/UtilityFooter.tsx` — tenant/role, session-started time, Help Centre/System Status/Release Notes links. Both rendered by `DashboardLayout.tsx` around every page's `children`. **Do not rebuild any part of these in the dashboard prompts.** |
| KPI role rendering | `src/pages/KpiPage.tsx` — `profile.kpi_role === 'csc_consultant'` → `<CscKpiCards subjectUuid period />` (`src/components/kpi-v2/CscKpiCards.tsx`, 3 gauges: Retention/Communication/Tasks via `fetchRetention`/`fetchCommunication`/`fetchCscTasks` RPCs in `src/lib/kpi-v2/fetchers.ts`); `'cst_assistant'` → `<AssistantKpiCards subjectUuid period />` (1 gauge: Tasks, computed client-side by unioning `tasks_tenants`+`client_action_items`+`ops_work_items`); `'developer'` → `<DeveloperPlaceholder />` (already-built "coming soon" card, use as-is). `period` type is `KpiV2Period` from `src/components/kpi-v2/types.ts` — reuse `defaultPeriod()` for "this month". |
| Task union (matches `/tasks`) | `src/pages/TasksManagement.tsx` `fetchTasks()`: `tasks_tenants` where `created_by = userId OR followers @> [userId]`; `client_action_items` where `status NOT IN ('done','cancelled') AND (owner_user_id = userId OR assignee_user_id = userId)`; `ops_work_items` where `status NOT IN ('done','cancelled') AND (owner_user_uuid = userId OR created_by = userId)`. Overdue = `due_date < today` (or `due_at` for ops items) on this same union. Reuse this exact query shape — do not write a new one from scratch. |
| Client Health / attention score | View `v_dashboard_attention_ranked`, column `worst_stage_health_status` (`healthy`/`monitoring`/`at_risk`/`critical`), filter `assigned_csc_user_id = profile.user_uuid AND tenant_status = 'active'`. Same view backs the existing Triage Dashboard's attention ranking — this is not a new query pattern for the codebase. |
| Team Workload (portfolio) | View `v_dashboard_labour_efficiency`, filter `csc_user_id = profile.user_uuid`. Columns: `client_count`, `total_overdue_tasks`, `total_open_tasks`, `overdue_ratio_pct`. This is a **different concept** from the personal task union above (it's the pressure across the user's *client portfolio's* compliance tasks) — label it distinctly, don't conflate with "Overdue Tasks." |
| Rocks | Table `eos_rocks`, filter `archived_at IS NULL AND level = 'company'` (no individual-level rock assignment exists today). Show `status` (`on_track`/`not_started`/`complete`/etc.) as a badge. **Do not** render `completion_percentage` as a progress bar — it's 0 on every real row. |
| Recent Client Broadcasts | Table `broadcast_campaigns`, order by `sent_at DESC`, `status = 'sent'`, limit 2–4. Columns: `title`, `body`, `target_mode`, `total_recipients`, `sent_at`. |
| Client Messages | Table `tenant_messages` joined to `tenants`. Scope to tenants where the current user is `assigned_csc_user_id` (via `tenant_csc_assignments`, `ended_at IS NULL`), most recent messages across those tenants; if none, fall back to no panel content (empty state), not an org-wide random thread. |
| Calendar | Table `calendar_events`, filter `start_at > now() AND (organizer_email = profile.email OR attendees::text ILIKE '%' || profile.email || '%')`, order by `start_at`, limit 4. No meeting-platform field is populated on real rows — omit the coloured platform dot entirely for now rather than defaulting it to a wrong colour. |
| Notifications bell | Table `user_notifications`, `count(*) FILTER (WHERE is_read = false AND user_id = profile.user_uuid)`. |
| Quick action modals (reuse, don't rebuild) | Create Task → `AddClientTaskDialog`/`AddStaffTaskDialog` (`src/components/`); Schedule Meeting → `MeetingScheduler` (`src/components/eos/MeetingScheduler.tsx`); Upload Document → `UploadDocumentDialog` (`src/components/documents/dialogs/`); New Ticket → `NewTicketModal` (`src/components/support-tickets/`). **Add Client has no modal** — deep-link the button to `/manage-tenants` for now. |
| Brand tokens | Purple `#7130A0`, Fuchsia `#ED1878`, Acai `#44235F`, Cyan `#23C0DD`, Light Cyan `#A6F1FF`, Light Purple `#DFD8E8`, Macaron `#F9CB0C`. Titles: Anton. Headings: Binate. Body: Calibri. No gradients/drop-shadows/glow per the brand spec's "what not to build" list — keep this flat, matching the rest of the app's existing card style. |

---

## Prompt 1 — Add "Triage Dashboard" nav item (additive only, zero risk)

Do not touch `src/pages/Dashboard.tsx` or its route. In `src/components/DashboardLayout.tsx`, in the WORK nav group, add a new item directly below "Dashboard":

```
🧭 Triage Dashboard → /triage-dashboard
```

In `src/App.tsx`, add a new route `/triage-dashboard` that renders the *same* `Dashboard` component currently mounted at `/dashboard` (`<Route path="/triage-dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />`). Do not change the existing `/dashboard` route in this prompt — it keeps working exactly as today. This prompt only adds a second door to the same room.

Acceptance: `/dashboard` and `/triage-dashboard` both render the current Triage Dashboard, byte-for-byte identical behaviour. Sidebar shows both nav items. No other files touched.

---

## Prompt 2 — New `/dashboard` page: welcome header + 6 metric cards

Now repoint `/dashboard` at a new page. Create `src/pages/MainDashboard.tsx`. In `src/App.tsx`, change the `/dashboard` route's element from `<Dashboard />` to `<MainDashboard />`. Preserve the existing non-staff redirect behaviour (if `!isVivacityStaffRole(profile?.unicorn_role)`, redirect to `/client/home`, matching what `Dashboard.tsx` does today). `DashboardLayout` already wraps this page with the logo bar, notifications, avatar menu, and footer — `MainDashboard.tsx` only needs to render its own content inside that shell. **Do not touch `TopBar.tsx`, `UtilityFooter.tsx`, or `DashboardLayout.tsx`'s existing chrome in this prompt.**

Build `MainDashboard.tsx`'s own content (this is genuinely new — nothing like it exists yet):

**Page header** — `"Welcome back, {profile.first_name}! 👋"` in Anton 22px. Subtext `"Here's what's happening today."` in Calibri 14px muted. Right-aligned on the same row: a `+ New Task` button (Fuchsia `#ED1878` filled, opens `AddStaffTaskDialog`) — this is page content, not a topbar addition.

**6 summary metric cards**, equal width, per the visual spec (white card, 0.5px border, 12px radius):
1. **Clients** — count from `v_dashboard_attention_ranked` where `assigned_csc_user_id = profile.user_uuid AND tenant_status = 'active'`. Label "Active".
2. **Overdue Tasks** — count from the task union (Codebase facts table), `due_date < today` (or `due_at` for ops items), scoped to current user. Red `#C62828` value if > 0. "View all →" links to `/tasks`.
3. **Due Today** — same union, due date = today. Amber `#856404` value if > 0. Links to `/tasks`.
4. **Team Workload** — `v_dashboard_labour_efficiency.overdue_ratio_pct` for current user. Label it "overdue ratio across your N clients" (pull N from `client_count` on the same row) so it's clearly not the same number as card 2.
5. **KPI Overall Score** — call the same role-branch as `KpiPage.tsx` (`profile.kpi_role`), but render only the primary gauge value + status label (condensed, not the full card grid). For `developer` role, show a small "Coming soon" chip instead of a percentage. Links to `/kpi`.
6. **Rocks Progress** — count of `eos_rocks` where `archived_at IS NULL AND level = 'company'`, value = count of `status = 'on_track'` over total (e.g. "6 of 8 on track"), **not** a percentage derived from `completion_percentage`. Links to `/eos/rocks`.

No panel grid yet — that's Prompt 3. Acceptance: page loads for a staff user, shows their real name and real numbers for all 6 cards, non-staff still redirect to `/client/home`.

---

## Prompt 3 — Panel grid: broadcasts, tasks, client health, KPI, quick actions, rocks

Add the 3-column panel grid below the metric cards (left ~38%, centre ~38%, right ~24%, 12px gap, stacking to a single column under 1024px).

**Left column:**
- **Recent Client Broadcasts** panel — `broadcast_campaigns`, 2–4 most recent sent, per Codebase facts. Footer link → `/communications`.
- **Tasks Overview** panel — the task union again (same data as metric card 2/3, this time as a list), tabs "My Tasks" / "Team Tasks" (Team Tasks can show the same union without the current-user filter, scoped to tenants in the user's portfolio — if that's too much for one prompt, ship "My Tasks" only and leave the tab disabled with a tooltip "Coming soon"). Checkbox marks complete via the existing mutation pattern already used in `TasksManagement.tsx` (optimistic update). Priority/due-date badges per the brand spec colours. Footer → `/tasks`.

**Centre column:**
- **Client Messages** panel — per Codebase facts (scoped to the user's assigned tenants via `tenant_csc_assignments`). Footer → `/client/inbox` or `/inbox` (check which one actually shows staff-side client threads before wiring — do not guess).
- **Rocks (Quarterly Priorities)** panel — company rocks, status badges, footer → `/eos/rocks`.

**Right column:**
- **Client Health** donut — `v_dashboard_attention_ranked.worst_stage_health_status` scoped to the user's assigned active tenants, relabelled per Decision #4. Footer → wherever the app's existing "my clients" list view lives (check `/manage-tenants` filtering options first).
- **KPI Dashboard** mini panel — same role branch as the metric card, but here show the full condensed card (or cards, for CSC) rather than just the headline number — i.e. this panel can show all 3 CSC gauges compactly, or the 1 Assistant gauge, or the Developer placeholder. Footer → `/kpi`.
- **Quick Actions** — 5 buttons per Codebase facts (Add Client → `/manage-tenants`, others → existing modals). No new modals built in this prompt.

Acceptance: every panel renders real per-user data, no hardcoded strings, empty states show a plain "Nothing here right now" message rather than fake placeholder rows.

---

## Prompt 4 — Upcoming Calendar panel

**Upcoming Calendar** — full-width panel below the grid. `calendar_events` per Codebase facts, horizontal scrollable row of event cards (month/day, title, time range in the viewer's local time — check what timezone convention the rest of the calendar UI already uses and match it, don't assume AEST is hardcoded elsewhere). No platform dot (data doesn't support it yet — see Codebase facts). Footer → `/calendar`.

No footer bar work in this prompt — `UtilityFooter` already renders globally with the real equivalent (session time, Help Centre/System Status/Release Notes). See "Already built — do not rebuild" above.

Acceptance: calendar shows the viewer's own real upcoming events. Nothing else on the page changes.

---

## Prompt 5 — Responsive pass + acceptance criteria sweep

No new data wiring in this prompt — purely layout and polish:
- Verify layout at 1280px / 1440px / 1920px per the brand spec.
- Sidebar collapse behaviour below 1024px (check existing collapse pattern in `DashboardLayout.tsx` rather than building a new one).
- Confirm messages/tasks panels poll or refetch on a reasonable interval (60s is fine) using the existing React Query patterns already in the codebase (`staleTime`, `refetchInterval`) — don't introduce a new polling mechanism.
- Run through the acceptance criteria list in Nova's original spec (VCC-PLAT-SPEC-001, section "ACCEPTANCE CRITERIA") and flag any item that no longer applies: #15 ("Footer bar shows Integrator name and session start time") is already satisfied by the existing `UtilityFooter` minus the "Integrator" label, which is deliberately not being added (see "Already built" above); #20 ("port back to production") doesn't apply to this workflow at all — Lovable commits straight to production, there's no promotion step (see [[lovable_no_pr_gate]]).

---

## What NOT to do in any of these prompts

- Don't rebuild the logo bar, search, notification bell, avatar menu, or footer — all already exist globally via `TopBar.tsx`/`UtilityFooter.tsx`. See "Already built — do not rebuild" above.
- Don't add "Integrator: Nova Canto" or any other static hardcoded label to a shared/global component — it doesn't fit a footer used by every page and every user.
- Don't touch `Dashboard.tsx`'s internals, or any other sidebar nav group (EOS, Administration, Resource Management, Academy Builder, System Config).
- Don't add a migration, column, table, enum, or RLS policy. If a prompt seems to need one, stop and raise it with Carl before proceeding — see the root `CLAUDE.md` "Lovable production DB change sessions" section.
- Don't build a progress bar off `eos_rocks.completion_percentage`.
- Don't invent a new "task" definition that differs from `/tasks`'s own union.
- Don't show org-wide numbers on any card that's supposed to be personal — every number here is "for the logged-in user," not "for Vivacity."
