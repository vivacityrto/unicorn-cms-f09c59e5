# Staff Engagement Detail Page

## Files
- **New:** `src/pages/admin/StaffEngagementDetail.tsx` — full detail page
- **New:** `src/pages/admin/staffEngagementChecklists.ts` — exports `ONBOARDING_PHASES` and `OFFBOARDING_PHASES` constants (verbatim from spec) so the same data can be reused by Activity Log lookups without bloating the page file
- **Edit:** `src/App.tsx` — add lazy import + `<Route path="/admin/staff-engagements/:id" element={<ProtectedRoute><StaffEngagementDetail /></ProtectedRoute>} />` right after the existing list route

No other files touched.

## Access gate
Reuse the same pattern from `StaffEngagements.tsx`: read `profile.unicorn_role` from `useAuth()`, allow only `"Super Admin"` or `"Integrator"`, otherwise render the Access denied block inside `DashboardLayout`.

## Data fetching
Three parallel `useQuery` hooks keyed on `["staff_engagement", id]`, `["checklist_completions", id]`, `["engagement_signoffs", id]`:
1. `staff_engagements` row by `id` — `select("*").single()`
2. `checklist_item_completions` by `engagement_id` — `select("item_key, completed_by, completed_at")`
3. `engagement_signoffs` by `engagement_id` — `select("signoff_role, signed_by, signed_at")`

Activity Log uses a fourth query: `checklist_item_completions` with embed `users:completed_by ( full_name )` ordered by `completed_at desc`. (Falls back to raw user_uuid if embed fails.)

## Header
- Back arrow (`ArrowLeft`) → `navigate("/admin/staff-engagements")`
- `H1`: `{person_name} — {role}` + `<StatusBadge>` (reuse mapping inline)
- Subtitle: `Started {fmtDate(start_date)}` · `Type: Onboarding|Offboarding`
- `DropdownMenu` "Manage" with single item **Cancel Engagement** → `AlertDialog` confirm → `UPDATE staff_engagements SET status='cancelled' WHERE id=:id`. Disabled if status is `completed` or `cancelled`.

## Step progress component
Local `PhaseProgress` component, 4 dots connected by thin lines. State per dot derived from completions / signoffs:
- **filled** (bg cyan-600 / brand) when every item across all sections of that phase is in `completedKeys`; SIGN-OFF filled when 3 signoff rows exist
- **active** (ring border, white fill) for first non-filled
- **inactive** (muted) otherwise

Empty `sections` phase (SIGN-OFF) is never "complete" via items — only via signoffs.

## Tabs
shadcn `Tabs` with `Checklist` (default), `Notes`, `Activity Log`.

### Checklist tab
- Select `phases = engagement.type === 'offboarding' ? OFFBOARDING_PHASES : ONBOARDING_PHASES`
- For each phase render an `<h2>` phase label, then an `Accordion type="multiple"` with all section keys as default value
- Section trigger: label left, `{doneCount}/{totalCount}` muted right
- Item row: `Checkbox` + label, `AlertTriangle` amber icon if `critical`, owner muted right. When ticked, below label show `{full_name} · {fmtDateTime}` using a `usersById` map built from the joined Activity query
- SIGN-OFF phase: render a single `Card` with muted text `Sign-off panel coming soon.`

#### Tick / untick mutations
- Tick: `INSERT { engagement_id, item_key, completed_by: auth user id, completed_at: now }`
- Untick: `DELETE WHERE engagement_id AND item_key`
- After each: compute `criticalKeys` from `phases`, check `allCriticalDone` against fresh `completedKeys`, and conditionally `UPDATE staff_engagements.status` between `in_progress` and `pending_signoff` (only those two transitions; never touches `completed`/`cancelled`)
- Invalidate the three relevant queries on success; optimistic UI not required

### Notes tab
Muted `Card`: `Notes coming in a future update.`

### Activity Log tab
Map joined completions to `{full_name} ticked {labelLookup(item_key)} · {fmtDateTime}`. `labelLookup` walks the phases constant; fallback to raw key. Empty state `No activity yet.`

## Helpers
- `fmtDate(d)` — `dd MMMM yyyy`
- `fmtDateTime(d)` — `dd MMMM yyyy HH:mm`
- `StatusBadge` / `TypeBadge` re-declared locally (spec says "do not touch other files")

## Out of scope (left for later prompts)
Sign-off panel, Create & Invite, Revoke Access, real Notes, Link Unicorn User.
