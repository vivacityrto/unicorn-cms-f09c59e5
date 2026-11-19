# Client portal redesign: Home, Packages, Academy analytics (19 November 2026)

**Status:** Home shipped in this change. Packages, Academy analytics and the AI summary are planned, not built.
**Scope:** what a client sees, using only data the portal already reads unless stated.

## Home (shipped)

The page is now a welcome banner (greeting, tenure, who your consultant is, Message / Book consult / Ask Viv), four key numbers (hours left, stages complete, open and overdue tasks, next renewal), one card per active package (progress bar, hours bar with 75% and 95% marks, a plain reason when a package is Drifting or Stuck), an "At a glance" summary, and a side column for needs attention, coming up and quick links.

- All figures come from `get_client_package_dashboard`. The reason text and the summary are built in `src/components/client/home/homeInsights.ts` from the same rules the status pill uses (no activity for 30 or 14 days, 95% or 75% of hours used, overdue tasks), so the words always agree with the pill. The summary is written by code, not by AI.
- The old audit readiness card was removed from Home. `v_client_dashboard_progress` returns the constants `documentation_coverage = 0` and `risk_state = 'on_track'`, so the card always read 0%. Fixing the view needs a migration and its own audit entry; until then do not show those two fields to clients.
- Dark mode: the page uses theme tokens only. See `docs/DESIGN_SYSTEM.md`.

## Findings for the next pieces (not yet changed)

- **Packages:** already shows hours, burndown and stages. Missing: why a package is Stuck (now derivable client-side), a run-out forecast (`rpc_get_package_usage` computes a 30 day rate but is staff only), and a package detail page (the "View" link only goes to the list).
- **Academy analytics:** `AcademyActivityDashboard` counts every enrolment source, which disagrees with the agreed rule that only `self_enrol` counts. `academy_lesson_progress` is not readable by a client admin, so lesson and time figures need a `SECURITY DEFINER` function. The SQL of `get_tenant_academy_staff_stats` is not in the repo. The same component is used on the staff tenant page.
- **AI summary:** needs a new client-safe function: caller's tenant taken from the sign-in, never the request body; facts built on the server; numbers in the answer checked against the facts; its own usage cap so it does not use up the chat quota. Merging a function deploys it to production.
