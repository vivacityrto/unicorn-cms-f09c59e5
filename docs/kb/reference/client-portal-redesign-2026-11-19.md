# Client portal redesign: Home, Packages, Academy analytics (19 November 2026)

**Status:** Home and Packages shipped. Academy analytics built; its database function is applied. The AI summary is planned, not built.
**Scope:** what a client sees, using only data the portal already reads unless stated.

## Home (shipped)

The page is now a welcome banner (greeting, tenure, who your consultant is, Message / Book consult / Ask Viv), four key numbers (hours left, stages complete, open and overdue tasks, next renewal), one card per active package (progress bar, hours bar with 75% and 95% marks, a plain reason when a package is Drifting or Stuck), an "At a glance" summary, and a side column for needs attention, coming up and quick links.

- All figures come from `get_client_package_dashboard`. The reason text and the summary are built in `src/components/client/home/homeInsights.ts` from the same rules the status pill uses (no activity for 30 or 14 days, 95% or 75% of hours used, overdue tasks), so the words always agree with the pill. The summary is written by code, not by AI.
- The old audit readiness card was removed from Home. `v_client_dashboard_progress` returns the constants `documentation_coverage = 0` and `risk_state = 'on_track'`, so the card always read 0%. Fixing the view needs a migration and its own audit entry; until then do not show those two fields to clients.
- Dark mode: the page uses theme tokens only. See `docs/DESIGN_SYSTEM.md`.

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
