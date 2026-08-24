# Staff PDP and Academy analytics plan

## Product outcome

Give client-portal organisation contacts a decision-ready view of staff development, while giving each staff member a clear personal next step in My PDP. Keep PDP progress, Academy learning activity, evidence, and reviews connected without turning activity data into opaque performance scoring.

## Stacked implementation strategy

### PR 1 — schema-safe dashboard foundation

- Create a Staff PDP overview dashboard at `/client/staff-pdps`.
- Replace the PDP-first table opening state with KPI cards and an action queue.
- Create a separate Academy Activity dashboard at `/client/academy-activity`.
- Reuse the existing PDP summary and `get_tenant_academy_staff_stats` data contracts.
- Add navigation from the client sidebar and clear links between the two dashboards.

### PR 2 — richer Academy analytics data contract

- Add a tenant-scoped analytics RPC/view for course-level funnel and time-series metrics.
- Track enrolled, started, in-progress, completed, certified, median completion time, and recent activity.
- Audit every database function/RLS/trigger change before implementation.
- Add transparent “last updated” and “how this is calculated” metadata.

### PR 3 — actionable insights and My PDP connection

- Add explicit, explainable attention rules: inactive, stalled, overdue, review due, and missing evidence.
- Add course-to-PDP evidence suggestions with user confirmation.
- Add My PDP “next best action”, progress pacing, evidence gaps, and review prompts.
- Record interventions so staff can see why an action was suggested and what happened next.

## Dashboard design

### Staff PDP overview

- KPI cards: total staff, current, at risk, overdue, average completion, and Academy participation.
- Action queue: staff or cycles needing a concrete next step.
- PDP status distribution and cycle timeline.
- Staff table retained as a drill-down surface, not the primary landing experience.

### Academy Activity

- KPI cards: active learners, completions, certificates, PD hours, and inactive staff.
- Learning funnel: enrolled → started → in progress → completed → certified.
- Course performance and staff engagement views.
- Time trend once the richer analytics contract exists.
- Detail drawer with activity context and links to the person’s PDP.

### My PDP

- Current progress and hours remaining.
- Next action and upcoming review.
- Goals without evidence.
- Recent Academy activity and confirmed evidence suggestions.
- Recommended courses tied to the PDP audience.

## Guardrails

- Use descriptive states such as “inactive for 30 days” or “course stalled for 14 days”; do not introduce opaque predictive labels.
- Show the data source, calculation definition, and last-updated time.
- Keep organisation-level visibility scoped to authorised tenant contacts and staff roles.
- Treat learning analytics as formative support, not a standalone performance rating.

## Acceptance criteria

- A client contact can understand staff development health within one screen.
- Academy activity is a distinct dashboard with a clear path to action.
- Every attention item has an explainable rule and a direct next action.
- Existing PDP cycle, evidence, review, and Academy flows continue to work.
- PR 1 remains deployable without a schema migration.
