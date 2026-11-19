# Client portal redesign: Home, Packages, Academy analytics (19 November 2026)

**Status:** Home and Packages shipped. Academy analytics built; its database function is applied. The AI summary is built as a button (see the last section).
**Scope:** what a client sees, using only data the portal already reads unless stated.

## Home (shipped)

The page is now a welcome banner (greeting, tenure, who your consultant is, Message / Book consult / Ask Viv), four key numbers (hours left, stages complete, open and overdue tasks, next renewal), one card per active package (progress bar, hours bar with 75% and 95% marks, a plain reason when a package is Drifting or Stuck), an "At a glance" summary, and a side column for needs attention, coming up and quick links.

- All figures come from `get_client_package_dashboard`. The reason text and the summary are built in `src/components/client/home/homeInsights.ts` from the same rules the status pill uses (no activity for 30 or 14 days, 95% or 75% of hours used, overdue tasks), so the words always agree with the pill. The summary is written by code, not by AI.
- The old audit readiness card was removed from Home. `v_client_dashboard_progress` returns the constants `documentation_coverage = 0` and `risk_state = 'on_track'`, so the card always read 0%. Fixing the view needs a migration and its own audit entry; until then do not show those two fields to clients.
- Dark mode: the page uses theme tokens only. See `docs/DESIGN_SYSTEM.md`.

## Home layout and updates (follow-up)

After the first Home release a layout audit at 1650 px found: the page stopped at a fixed width while the status banner above spanned the full width; the "From Vivacity" tiles were squeezed into a narrow column and clipped; needs-attention titles were cut to a few letters; and the left column ended well above the right. Fixes: the page fills the available width, the two columns are balanced (packages, Academy, regulatory updates and recent activity on the left; summary, needs attention, coming up, messages and reminders on the right), the service tiles are a full-width row, titles wrap to two lines, and a no-end-date renewal tile shows an empty ring. Home now also carries an Academy card, the latest broadcast messages from Vivacity (conversations of type broadcast, with an unread marker) and the latest regulatory updates (the same events as the Regulatory Updates page).

## Whitespace, footer and Home panel (follow-up)

Pages fill the width the portal gives them: Academy Activity and Staff PDPs no longer sit in a centred container, and Packages no longer caps at a fixed width (guarded by `client-page-width.test.ts`). The client footer is pinned to the bottom of the window beside the sidebar, at the same 25px height as the staff footer, with the legal line hidden on narrow screens. On Home, "Messages from Vivacity" and "Reporting reminders" are a compact two-column row under the key numbers (three rows each, the rest one click away); if only one has content it takes the full row.

## Inbox (shipped)

The client Inbox keeps its data, deep links and behaviour (messages, notifications, attachments, new message, read-only mode) and changes how it looks and works: a purple banner with what is waiting; the three views (Everything, Messages, Notifications) as cards that each show the unread count, the total and an insight (for example "1 from Vivacity waiting" or "1 task, 1 obligation to look at") instead of bare tab labels; day headings (Today, Yesterday, This week, Earlier) in the All and Notifications feeds; coloured icons for what each item is about; search and filter pills (Unread and by kind) on messages and notifications; chat bubbles with avatars and day dividers in a conversation; and, below 1280px, one pane at a time (list or conversation, with a Back button) instead of both stacked. The old notification filter compared the raw type to words like "tasks" and so matched nothing; it now maps types to kinds (`inboxFormat.ts`). A race that could re-open a conversation just closed is fixed by syncing the selection only when the URL parameter changes.

## Inbox crash audit (follow-up)

Reopening a conversation (open, go back, open again, or React remounting) crashed the page with "cannot add postgres_changes callbacks after subscribe()". supabase-js returns the same channel instance for a name already in use and removes channels asynchronously, so the fixed channel name `conv-live:<id>` handed back a channel that was still subscribed. Every client-portal realtime channel (conversation, layout notifier, unread badge, help-centre thread) now gets a unique name from `src/lib/realtimeChannel.ts`. `ClientInboxPage.flows.test.tsx` drives the real hooks over a fake database with a channel that behaves like supabase-js (including slow removal) and clicks every card, filter and row; it fails without the fix. The Inbox is also wrapped in an error boundary so a future render error shows a message with Try again instead of a blank page. Rule for new code: never subscribe with a fixed channel name that can be reopened.

## Regulatory updates (shipped)

The list is a purple banner with the counts that matter (updates, new in the last 30 days, high or critical), five cards that double as the impact filter (All, Critical, High, Moderate, Low, each with what that level means for the client), search and regulator pills, and the updates as cards under month headings in a two-column grid. Each card shows a coloured edge for the impact, who published it, a plain excerpt of what changed (the machine-readable analysis block is left out), how many areas are affected and a New marker for the last 30 days. The detail page puts "why it matters", the change summary and the affected areas (as a grid) on the left and an "At a glance" card, a link to the regulator page and a "Message your CSC" button on the right; citations stay below. Data access is unchanged. Helpers are in `src/features/regulatory-updates/regulatoryView.ts`.

## Packages (shipped)

- A "How this package is tracking" card on each package says what the status pill means, why this package has it (same reason text as Home), and where its hours are heading.
- The hours forecast (`packageInsights.ts`) uses hours recorded in the last 28 days from the existing timeline function, so no new data access: it says when the hours would run out, or how many would be unused at the end date, and calls itself a projection. A dashed line on the burndown chart shows it.
- With more than one active package, "Packages compared" draws progress and hours bars side by side.
- Finished stages show their completion date under the stepper and in the tooltip.
- Not done: a package detail page behind "View", and a stuck reason from the server (the client-side reason mirrors the SQL rules in `get_client_package_dashboard`; if those rules change, change `statusReason`).

## Academy analytics (shipped)

The Academy page counts only courses the team chose themselves. It shows active learners, courses finished, lessons completed and learning time, a plain "at a glance" summary, a weekly learning chart drawn to a real scale, a per-person table (finished, lessons, hours, status), courses that have sat untouched for 30 days, and a courses table. A footnote says how many courses were added another way and are not counted. Everything comes from the new `get_tenant_academy_learner_analytics` function (audit entry `2026-11-19-academy-learner-analytics-function`). The same component serves the staff tenant page.

## Findings for the next pieces (not yet changed)

- **AI summary:** needs a new client-safe function: caller's tenant taken from the sign-in, never the request body; facts built on the server; numbers in the answer checked against the facts; its own usage cap so it does not use up the chat quota. Merging a function deploys it to production.

## Tasks and Users (shipped)

Both pages open with a brand banner and use insight cards instead of tabs and filter buttons. Each card shows a count plus one line about what it means, and clicking it filters the table below (they are toggle buttons, so keyboard and screen readers work like the tabs they replace). The shared pieces live in `src/components/client/insight/InsightCards.tsx` (cards, stacked status bar, ranked bars).

- **Tasks:** cards for All, Overdue (oldest is N days late), Due soon (next task and when) and Completed (percent done). "My tasks" is now a pill in the banner, and "Show archived" sits beside it. A panel shows where the work stands (status bar) and open tasks per person, with unassigned as its own row. The editable table, bulk selection and optimistic edits are unchanged. Figures come from `taskInsights.ts`.
- **Users:** cards for Everyone, Active (seen in the last 7 days), Pending invites (soonest expiry) and Quiet (not seen in 30 days, or never signed in). Panels show access mix and when people were last seen. Seats used appear in the banner. Invite, role switch, position, swap and ghost-contact behaviour are unchanged. Figures come from `userInsights.ts`.
- Not checked on live client data yet; layout was verified by tests and typecheck only.

## Staff PDPs (shipped)

The page now opens with a brand banner (audience and year filters and the audit-pack export sit in it) and four filter cards: Everyone, Needs attention (overdue plus at risk), On track and Target met. A card writes the same `status` URL parameter as before, so existing bookmarks keep working; unknown status, audience or year values in the address are ignored instead of hiding everyone. Cards, charts and the table all use the same audience and year selection (the old page showed two sets of numbers on different bases).

Four panels: where everyone stands (status split with the plain-words rules, taken from the `v_pdp_user_currency` view: overdue = cycle ended unfinished; at risk = 30 days or fewer left and under 80% done; current = target met; on track = not late yet, which is not ahead); who to nudge first (overdue, at risk, then anyone behind pace, with a reason such as "9 days left, 20 h short"); hours by audience (done against target, with the shortfall); and when cycles end (next six months, risky ones in pink). The table shows progress with a tick for how much of the cycle has passed, hours with the gap, and "in N days".

Pace is derived, not stored: time elapsed assumes a 12-month cycle because the row has no start date, so it is approximate and is hidden in the first month and when there is no target. Behind pace means 15 or more points behind the calendar. Team progress is hidden for fewer than three people. A visible notice appears if the 2,000-row limit is hit.

Findings from the council, not changed here: the view definition is not in the repo as a migration (read from the live database), the route has no guard beyond the in-page `canManagePortalUsers` check, the drawer opens the newest cycle rather than the row's cycle, and export covers the whole organisation whatever is filtered. Not checked on live data.

## Academy: one person's activity (shipped)

Each row in "Your team" on the client Academy page is now a button that opens a mini page (a side panel) for that person: key numbers (courses finished, lessons done of available, learning time, certificates), a plain "at a glance" summary, their own weekly chart, and every course they chose with lesson progress, state (finished, in progress, untouched 30+ days, not started), dates and certificate. It reads from the new `get_tenant_academy_learner_detail` function (audit entry `2026-11-19-academy-learner-detail-function`), which is applied to production. Courses added another way are left out, as everywhere on this page.

## Package analytics (shipped)

The package page now has an analytics section under the tracking card, built from one new client-safe function (audit entry `2026-11-20-client-package-activity-function`, applied to production):

- **Your week at a glance:** this week against last week in plain sentences (hours, entries, main work, touchpoints with the Vivacity team, tasks closed, documents generated), a ring for the share of the package used, and a Copy summary button.
- **Activity timeline:** hours used as a rising line, with every active week as a dot below it. A dot's shape and colour are the main kind of work that week and its size is the number of entries; finished stages are green flags; a rule marks today. Dots are keyboard-focusable and open a week mini page; a View as table toggle gives the same data as a table.
- **Hours by week:** a heatmap of weeks by kind of work (biggest five plus Other), every square opens that week.
- **How the mix of work changed:** each month's hours as shares of the kinds of work.
- **Week mini page:** hours by kind of work, plus counts of emails, calls, meetings and follow-ups, tasks closed and documents. Counts only: nothing from note text is ever shown, and the function returns no consultant names.

Every figure reconciles with the existing hours functions (same window, billable only, carry-over excluded). One look per kind of work (`workTypeStyle`) is shared by every chart.

**Not built yet (designed in the council review):** collecting input from clients in the package (a fortnightly one-tap pulse, confidence rating per stage, goals per stage, a blocker flag, post-consult feedback, at most one prompt per person per week, stored in a new table with tenant-scoped row security and kept out of any health score until the thresholds are signed off); and an AI-drafted weekly snapshot (draft only, built from the same deterministic facts, with the guardrails in `ai-use-principles.md`). Three existing exposures of internal data to clients are recorded in the audit entry for a decision.

## Viv's insight (button-triggered AI summary, in review)

Home, Packages and Academy Activity each have a "Viv's insight" card with an "Ask Viv for an insight" button (`ClientInsightCard`, `use-client-insight.ts`, Edge Function `client-insights`, audit entry `2026-11-20-client-insights-edge-function`). The rule: everything on the pages is calculated by code (the "At a glance" cards, the weekly snapshot, the forecasts) and costs nothing; AI runs only when a person presses the button.

- Nothing runs on page load. A result is reused for 30 minutes, so pressing again inside that time does not call the model.
- The server builds the facts from the caller's own data, sends no names, and drops any answer with a number that is not in the facts. The result is labelled as written by AI.
- Same access gate, rollout flag and daily token budget as the client Ask Viv chat; staff previewing a client pass the previewed organisation, which the server still verifies.
- Errors read in plain words (not switched on, today's limit reached, busy, could not write a summary).
- Not built: an AI-drafted weekly snapshot for packages, and AI summaries of client check-in comments (the check-ins themselves are not built).

## Package check-ins (database applied)

Each package card has a short check-in for people with full access (`PackageCheckIn`, `use-package-checkin.ts`, audit entry `2026-11-20-package-checkins`, migration applied to production): a two-weekly pulse (1 to 5 with a word for each number, optional note), a weekly "how confident are you about your next audit" rating, and a "Something is blocking me" flag (category plus a short description). People see only their own answers and a small trend; their consultant can read all of them.

- Written only through `submit_package_checkin` (no direct writes), which takes the person from the sign-in and the organisation from the package, refuses staff and anyone without full access, and rate-limits (one pulse per 13 days, one confidence per 6, three blockers a day). One tap per question, never more than one prompt per kind per person in its window, to keep survey fatigue low.
- Answers are a separate qualitative input: not scored, not part of any health score, and never sent to AI (a test guards this).
- **Not built yet:** the staff side (a consultant view of answers and trends, an alert on two low pulses or a blocker), goals per stage, post-consult feedback, and button-triggered AI summaries of comments.

## Staff view of client check-ins (database applied)

On the staff client page (Overview tab, under pinned notes) a "Client check-ins" card shows what the client's team has told Vivacity on each live package (`TenantCheckinsCard`, function `get_tenant_checkins_overview`, audit entry `2026-11-20-tenant-checkins-overview`, applied to production): each person's recent pulse and audit confidence, and any blocker flagged in the last 30 days with the category and the short description the client wrote.

- Two plain flags, no score: a blocker in the last 30 days, or a person's last two pulses both 2 or lower. A package with no answers reads "No check-ins yet", never as fine, and answers feed no health score.
- Staff and super admins only; names only (no emails or ids); the client's description is shown as plain text and never sent to AI.
- Not built yet: acknowledging or resolving a blocker, a cross-client list of what needs attention, and notifications to the consultant.

## Consultant attention list (database applied)

The staff dashboard has a "Client check-ins needing attention" card under the six summary cards (`CheckinsAttentionCard`, function `get_checkins_attention`, audit entry `2026-11-20-checkins-attention-list`, applied to production). It lists live packages with a blocker flagged in the last 30 days or a person whose last two pulses are both 2 or lower (the latest within 45 days), blockers first. It opens on "My clients" (packages the signed-in consultant manages) when they have any flagged, otherwise on all clients, shows six with a "Show all" button, and each row opens the client page.

- Two plain flags, no score; answers feed no health score and are never sent to AI. The client's description is clipped to 160 characters and shown as plain text.
- Staff and super admins only; names only (no emails or ids).
- Not built yet: acknowledging or resolving a blocker, and push notifications when a blocker arrives (the list is something to look at, not something that interrupts).

## Blocker acknowledgement and notification (database applied)

When a client flags a blocker, the package manager now gets an in-app notification (it names the client, the person and the category, not the client's words). On the staff client card each blocker has a status (New, Seen, Resolved) and buttons to mark it seen, resolve it or reopen it, with an optional note. Audit entry `2026-11-20-blocker-acknowledgement-and-notification`; migration applied to production.

- **The note is for the client.** It appears on the client's own package page next to that blocker ("From your consultant"), together with its status (sent, seen, resolved), so staff must keep it to what the client should read. The staff screen says so.
- Only unresolved blockers count as needing attention, on the client card and on the dashboard attention list, which also shows a "New" badge for blockers nobody has seen. Resolved blockers stay on the client card, dimmed, for context.
- In-app only: no email or other push message. Notifying the client when their blocker is seen or resolved is not built (they see the status when they next open the package).

## Client data exposures (fixed)

Three exposures of internal data to clients were found in the package analytics review and are fixed in migration `20261120110000_restrict_internal_notes_to_staff.sql` (audit entry `2026-11-20-restrict-internal-notes-to-staff`, **applied to production 19 November 2026**, postflight verified). Testing showed the first was worse than recorded: any client member could read, edit and delete every note for their organisation (a rolled-back test did all three on 139 of 139 notes). Notes, client notes and tenant notes are now staff-only.

- **Removed for clients, by Carl's decision ("Remove both for now"):** the pinned-note banner on the package page, the "urgent note" item on Home (it showed the title of an internal pinned note), and the staff notes line under each entry in "recent work". The package status pill, including "on hold", is unchanged.
- No client has ever written a note, and no client-portal page read these tables directly, so nothing a client used is lost except the two note-based items above.
- If staff should share a note with a client on purpose, that needs an explicit "share with client" option; it is not built.

## Client sidebar: collapsed icon rail by default (20 November 2026)

The client portal sidebar now opens as a narrow icon rail and remembers if someone widens it (on a laptop or desktop; on a phone the sidebar is an overlay that always starts closed). In the rail, hovering or focusing an icon floats the item's name and one line about it beside it (`RailTip` in `ClientSidebar.tsx`; every item has a short `description`), and each icon has an accessible name. When the sidebar is open the words are on screen and no floating label shows. The preference is kept in `client-sidebar-open` (`sidebarPreference.ts`).

**Open question for the staff portal (nested menus):** the staff menu has groups with items inside them, which a flat icon rail cannot show. Recommended approach, to decide after reviewing the client rail live: group icons in the rail; hovering, focusing or tapping a group opens a floating panel beside it listing the group's items (name plus one line each, the current page marked), keyboard friendly (Enter, Space or Right arrow opens it, Up and Down move, Escape closes), a tap on touch devices; the expanded sidebar keeps ordinary expandable groups; and a quick "Go to…" search (Ctrl+K) to reach any page without opening groups at all.
