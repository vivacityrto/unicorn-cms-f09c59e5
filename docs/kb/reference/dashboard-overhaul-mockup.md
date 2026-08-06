# Dashboard Overhaul Mockup

> **Last updated:** 2026-07-03 · **Reconsider by:** 2026-08-03 (data snapshot goes stale fast — re-pull before using for a real Lovable prompt) · **Confidence:** high on schema/formula facts (queried live), low on presentation choices (my judgment calls on how to reframe mismatched panels)
>
> **Reflects commit:** `<codebase>@89aefd4e` (2026-07-03) · **Data pulled from:** Supabase project `yxkgdalkbrriasiyyrwk` (Unicorn 2.0 prod), read-only queries, same date

Open: [dashboard-overhaul-mockup.html](dashboard-overhaul-mockup.html)

Static HTML mockup of Nova's VCC-PLAT-SPEC-001 Main Dashboard spec, seeded with real production numbers instead of Nova's placeholder sample data — so Carl can see what the dashboard would actually look like, not just what it looks like with invented numbers.

## Why real data instead of samples

Nova's spec ships with sample data (128 clients, 24 overdue tasks, KPI sparklines, etc). Pulling real numbers surfaced three genuine data-quality gaps that sample data would have hidden:

1. **Rocks completion % is always 0.** Every row in `eos_rocks` has `completion_percentage = 0`, even for rocks marked `on_track`. No UI currently writes to this field. The "Rocks Progress" progress bar in Nova's spec can't be built without either backfilling this field or computing progress a different way.
2. **Calendar events don't capture a meeting platform.** `calendar_events.teams_join_url` is null on every real upcoming event sampled. The coloured Teams/Zoom/Google Meet dot in Nova's "Upcoming Calendar" panel has no data to render from — a new capture step would be needed at sync time.
3. **Naive task counts are a trap.** `select count(*) from staff_task_instances where ... overdue` returns **24,280** — almost entirely stale/legacy synced rows. The Triage Dashboard's own hooks already know this and instead aggregate through `v_dashboard_attention_ranked` (which scopes to active tenants), giving a sane **101**. Any Lovable prompt for the new dashboard's "Overdue Tasks" card must be told explicitly which view/aggregation to query — not "count tasks where overdue."

## Client Health formula (real, from live DB)

Nova's spec wants an Excellent/Good/At Risk/Critical client health donut. Carl asked where this comes from. Answer: it maps directly onto the existing **stage health** system already computed nightly for the Triage Dashboard — no new metric needs to be invented.

**Per-stage-instance**, a nightly job writes a row to `stage_health_snapshots` with a `health_status` of `healthy` / `monitoring` / `at_risk` / `critical`, driven by (per `StageHealthPanel.tsx` and `TenantStageHealthSummary.tsx`): open/overdue task counts, high-risk-event count, mandatory evidence gaps, and days since last activity on that stage.

**Per-tenant**, `worst_stage_health_status` (in `v_dashboard_tenant_portfolio` / `v_dashboard_attention_ranked`) takes the *worst* status across all of that tenant's stages — one bad stage drags the whole client down.

**Suggested relabel for the new dashboard** (no new computation, just friendlier copy):

| Real value | Nova's label |
|---|---|
| `healthy` | Excellent |
| `monitoring` | Good |
| `at_risk` | At Risk |
| `critical` | Critical |

Real distribution today (62 active tenants, 58 with a snapshot): Excellent 54, Good 3, At Risk 0, Critical 1.

This `worst_stage_health_status` also feeds 30% of the **attention_score** used to rank the Triage Dashboard's "Attention Ranking" — the live `calculate_attention_score()` Postgres function (queried directly, not inferred from migration history since it's been revised twice):

```
attention_score = round(
    0.25 * stage_score
  + 0.20 * gaps_score
  + 0.15 * risk_score
  + 0.15 * staleness_score
  + 0.15 * task_score
  + 0.05 * renewal_score
  + 0.05 * burn_score
)
-- escalation floor: if overdue_tasks >= 3 and score < 70, force score to 70
```

`stage_score` itself is derived from `worst_stage_health_status` (critical=100, at_risk=70, monitoring=35, healthy=0) plus bumps for critical/at-risk stage counts. So Client Health and the Triage Dashboard's attention ranking share the same underlying signal — they're two views on one thing, not two separate metrics to maintain.

## "Team Messages" reality check

Carl confirmed this is meant to come from the "Communications" page. The real Communications module (`src/components/communications/BulkMessageDialog.tsx`, table `broadcast_campaigns`) is a **staff → client bulk announcement tool** (target by everyone / members / tier / package type), not staff-to-staff chat. There is no internal team-chat feature in the schema today.

Mockup reframes the panel as "Recent Client Broadcasts" using two real sent campaigns (Quality Indicator Reporting reminder, Australian Government Funding guide). This is a real, useful signal for a staff landing page (visibility into what's just gone out to clients) — just not literally "messages between team members" as Nova's copy implies. Worth deciding with Nova whether that reframing is acceptable, or whether "Team Messages" should instead become a genuinely new feature.

## Nav change

Per Carl's direction (2026-07-03): the current Triage Dashboard is not being hidden at a deprecated route — it becomes a permanent, first-class nav item ("Triage Dashboard") alongside the new "Dashboard". Full existing sidebar (EOS suite, Academy Builder, Resource Management, System Config, etc.) stays untouched; Nova's simplified nav sketch in the spec is not being adopted.

## KPI mini panel — contextualize by kpi_role (per Carl, 2026-07-03)

`/kpi` (`KpiPage.tsx`) already does exactly this — reuse the same logic instead of inventing a generic 6-row KPI list:

- `profile.kpi_role` drives which card set renders: `csc_consultant` → `CscKpiCards` (3 gauges: **Retention, Communication, Tasks**), `cst_assistant` → `AssistantKpiCards` (1 gauge: **Tasks**, unioned across `tasks_tenants` and task instances), `developer` → `DeveloperPlaceholder` (an existing "coming soon — Q3 rollout" card, already built, matches Carl's ask exactly), anything else → "KPI tracking isn't configured for your role yet."
- The new dashboard's KPI mini panel should call the same per-role logic and show a condensed version of whichever card set applies to the logged-in user — not a fixed generic list. Worth noting: the Assistant role's one KPI gauge is itself built on `tasks_tenants`, which the task-usage analysis below shows is barely used (~8 rows in prod) — so that gauge is already thin on signal.

## Task data usage analysis (per Carl, 2026-07-03)

Carl asked whether staff/CSC Assistants actually change task status — i.e., is either task-tracking surface real signal, or just inherited data. Queried live against prod. Short answer: **no surface shows strong evidence of live day-to-day status tracking.** Two different failure modes:

**`staff_task_instances`** (71,160 rows — auto-generated per stage instance from `staff_tasks` templates; this is "staff task from the packages"):
- **100% of rows have `updated_at = created_at`** — not one row has ever been modified since the moment it was created.
- 13,141 rows (18%) are marked `completed`, but only **81 (0.6%)** have a `completed_by` user — the rest were set with no human attribution.
- `completion_date` values range from **2013 to 2025**, while `created_at` values only start in 2026 — completion dates were carried over wholesale from a legacy system, not set by anyone using Unicorn 2.0.
- Only 19 distinct creation days across 71,160 rows confirms bulk generation in batches, not organic day-by-day package activity.
- **Conclusion: this table is inherited legacy data. Staff are not using it to track task status in Unicorn 2.0.**

**`client_task_instances`** (23,036 rows — the client-facing counterpart): looked more promising at first glance (93.5% of rows have `updated_at ≠ created_at`), but 21,395 of those "touches" (99.7% of them) landed on a **single day, 2026-05-01** — a bulk migration/backfill event, not usage. Real organic touches after that: ~137 rows spread across five other days out of 23,036 total (0.6%). Completion dates also stretch back to 2015. **Same story as staff instances: overwhelmingly inherited, not live.**

**`tasks_tenants`** (the actual `/tasks` page CSC Assistants use ad hoc — ~8 rows in prod): tiny, but genuinely shows a live status mix (not_started / in_progress / completed) tied to real `created_by`/`followers`. This is the one surface plausibly reflecting real usage — just at near-zero volume.

**`client_action_items`** (161 rows): 154 of 161 (96%) never touched since creation, across only 8 creation days. Created and then abandoned — people log the item but don't work it through to done in the tool (2 done, 1 in_progress, 158 stuck at todo/open).

**Why this matters for the dashboard:** it explains the earlier "24,280 overdue tasks" trap from a different angle. It's not just that the raw count includes stale rows — it's that almost none of those rows would ever change status even if someone looked at them, because status-tracking on the package-driven task surfaces isn't part of anyone's actual workflow yet. An "Overdue Tasks" card built on `staff_task_instances`/`client_task_instances` due dates will read as a large, permanently-red number that doesn't reflect real staff behaviour — it reflects a workflow feature nobody has adopted. Options: (a) don't headline a task-overdue metric sourced from these tables until adoption improves, (b) source it only from `tasks_tenants` (real but tiny), or (c) treat this as a product problem to fix (drive adoption of status updates) before making it a trusted dashboard signal.

### Decision (Carl, 2026-07-03): task nomenclature = the /tasks Task Management page

Overdue Tasks / Due Today / Tasks Overview on the new dashboard use the exact same definition as `TasksManagement.tsx` — the union of:
- `tasks_tenants` (ad hoc, created_by/followers = current user)
- `client_action_items` (status not in done/cancelled, owner/assignee = current user)
- `ops_work_items` (status not in done/cancelled, owner/creator = current user)

**Not** `staff_task_instances`/`client_task_instances` (shown above to be ~unused legacy data) and **not** `v_dashboard_attention_ranked`'s `overdue_tasks_count` (a different concept — compliance/package-stage tasks, used by the Triage Dashboard, not the Task Management page). These are three genuinely different definitions of "task" in this codebase; the dashboard now commits to the Task Management one so the summary card and the linked full page always agree.

Real org-wide snapshot with this definition (2026-07-03): **165 open, 122 overdue, 1 due today** — almost entirely from `client_action_items` (`tasks_tenants` contributes only 6 open, 0 overdue; `ops_work_items` is empty).

### Considered and reverted: excluding `client_action_items`

Briefly considered cutting `client_action_items` out entirely, since checking who they're assigned to shows they're mostly the **tenant's** to-dos, not staff workload — of 161 rows, only 3 have a client-side assignee, 158 have no assignee at all, and every populated `owner_user_id` (27) resolves to a staff member, never a client. Also, `client_task_instances.published_action_item_id` is set on only 134/23,036 rows (0.6%) — the publish-to-client workflow is itself barely used.

### Final decision (Carl, 2026-07-03): mirror `/tasks` as-is, for now

Carl's call: don't have the dashboard invent its own cut of what counts as a "task" — the summary cards should just **mirror whatever `/tasks` itself already computes and shows**, i.e. its existing union of `tasks_tenants` + `client_action_items` + `ops_work_items`. Whether `client_action_items` *should* be in that page's own definition is a separate, later product question — out of scope for this dashboard work. This also keeps the dashboard card and the page it links to trivially consistent (same numbers, always), which is a real virtue on its own.

**Definition in effect:** Overdue Tasks / Due Today / Tasks Overview = exactly what `TasksManagement.tsx` (`/tasks`) fetches for the current user, unmodified. Real org-wide snapshot: **165 open, 122 overdue, 1 due today** (per-user numbers will be much smaller on the live dashboard). The ownership analysis above stays useful context — it just isn't being acted on right now.

## Personalized to a real user (Carl, 2026-07-03)

Mockup now reflects **AJ Delostrico's actual dashboard**, not org-wide aggregates — Carl asked for per-user contextualization, and AJ was the example. Identity: `unicorn_role='CSC'`, `kpi_role='cst_assistant'` (Administration Assistant), 14 assigned active clients. Note there are two "AJ Delostrico" user rows differing only by email case (`aj@` vs `AJ@vivacity.com.au`) — used the one with populated role fields as the real account; the other looks like an orphaned/legacy duplicate worth a cleanup ticket at some point, not urgent.

Per-user real numbers pulled:
- **Clients: 14** (`v_dashboard_attention_ranked` where `assigned_csc_user_id` = AJ, active only)
- **Client Health: 14/14 Excellent** (all her clients are `healthy` — a clean, real, unremarkable result)
- **Overdue Tasks / Due Today: 0 / 0** (her own `/tasks`-definition items — none overdue, none due today)
- **Team Workload: 60% overdue ratio** across her 14 clients (`v_dashboard_labour_efficiency`, `csc_user_id`=AJ: 3 overdue / 5 open portfolio tasks) — a different, portfolio-level concept from the Overdue Tasks card above; kept both, clearly labeled, so they don't read as contradictory
- **KPI Overall Score: 33%, Needs Attention** — her real `AssistantKpiCards` "Tasks" gauge computed exactly as `/kpi` does it (This Month period): 1 of 3 tasks created in July completed on time, target 85%
- **Tasks Overview**: her 5 real open `tasks_tenants` rows (client_action_items/ops_work_items contribute 0 for her specifically)
- **Upcoming Calendar**: her 4 real upcoming `calendar_events` (organizer or attendee match on `AJ@vivacity.com.au`)

**Notable aside surfaced by this exercise:** AJ personally accounts for **7 of the 8 total rows** in `tasks_tenants` org-wide. The ad hoc "Tasks" page isn't a team tool in practice yet — it's essentially one person's to-do list.

**Not personalized (flagged in the mockup):** "Recent Client Broadcasts" and "Client Messages" panels stayed org-level — no clean per-staff scope was found for either without more schema digging (broadcasts aren't attributed to a sender in a simple queryable way; the client-messages thread shown isn't confirmed as one of AJ's own clients). Rocks also stayed company-level — no individual-level rock assignment exists for AJ in `eos_rocks`.

## Not yet decided

- Exact route path for the new "Triage Dashboard" nav item (e.g. `/dashboard/triage` vs `/triage-dashboard`) and whether `Dashboard.tsx` gets renamed or just re-routed.
- What KPI Overall Score / 7-day sparkline should show given only 1 published `kpi_reviews` row exists org-wide.
- Whether "Add Client" gets a real modal or the dashboard just deep-links to `/manage-tenants`.

See [[dashboard_overhaul_context]] memory entry for the running context on this initiative.
