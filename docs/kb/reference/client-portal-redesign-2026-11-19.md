# Client portal redesign: Home, Packages, Academy analytics (19 November 2026)

**Status:** Home and Packages shipped. Academy analytics built; its database function is applied. The AI summary is planned, not built.
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
