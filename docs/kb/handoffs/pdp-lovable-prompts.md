# Unicorn 2.0 — PDP Module Lovable Prompts

**Module:** Vivacity Academy → Professional Development Plan (PDP)  
**Schema applied:** 11 May 2026, Supabase project `yxkgdalkbrriasiyyrwk`  
**Run order:** Sequential. Each prompt assumes the previous one shipped clean.  
**Last reviewed against codebase:** 11 May 2026 (`unicorn-cms-f09c59e5` HEAD `893fc01a`)

---

## Tables in scope (created and RLS-enforced)

`pdp_audiences`, `pdp_cycles`, `pdp_goals`, `pdp_evidence_items`, `pdp_reflections`, `pdp_reviews`  
Views: `v_pdp_cycle_summary`, `v_pdp_user_currency`

---

## Hard rules (from `.lovable/plan.md`)

- RLS is on every PDP table. Do not bypass.
- All evidence file uploads go to a private Storage bucket. Browser receives signed URLs only.
- `supabase-js` in the SPA. No Prisma. No `VITE_*` for secrets.
- TypeScript strict. No `any` in new code.
- New code slots beside existing Academy code — do not refactor `academy_*` UI unless the prompt explicitly says so.

---

## Codebase facts (verified against HEAD — read before editing prompts)

| Fact | Detail |
|---|---|
| Lesson viewer | `src/pages/client/AcademyLessonViewerPage.tsx`. Route: `/academy/course/:slug/lesson/:lessonId`. |
| Lesson completion hook | `src/hooks/academy/useCompleteEnrollment.ts`. Calls `supabase.rpc('complete_academy_enrollment')`. `showCelebration` fires on **course** (enrollment) completion only — NOT individual lesson completion. Per-lesson completion is detected via a `completedLessonIds` / `currentProgress.is_completed` transition in the viewer. |
| Academy page shell | `AcademyPageWrapper` from `@/components/academy/AcademyPageWrapper`. Props: `title`, `subtitle`, `icon`, `accentColour` (Australian spelling). |
| Navigation config | **`navigationConfig.ts` is not used by `AcademyLayout.tsx`** — the layout has its own hardcoded arrays (`academyPathwaysItems`, `academyMainItems`, etc.). Edit `src/components/layout/AcademyLayout.tsx` directly to add/remove nav items. |
| Shared edge function helpers | `_shared/cors.ts` and `_shared/supabase-client.ts` (not `supabase.ts`). |
| Tenant context hook | `useClientTenant()` from `@/contexts/ClientTenantContext` — exposes `activeTenantId: number | null`. |
| Superadmin route guard | `<ProtectedRoute requireSuperAdmin>` in `src/App.tsx` — matches all existing `/superadmin/*` routes. |
| RBAC hook | `useRBAC()` from `@/hooks/useRBAC` — exposes `isSuperAdmin`, `isVivacityTeam`. |
| `is_vivacity_internal` | Column on `users` table. Used for internal-staff filtering in queries. |
| No `src/features/` directory | Does not exist yet — Prompt 1 creates it. |
| No `src/pages/tenant/` directory | Does not exist yet — Prompt 12 creates it. |

---

## Prompt 1 — Regenerate Supabase types and add PDP shared module

Regenerate TypeScript types from Supabase so the new tables and views appear in the generated types file. The new tables are: `pdp_audiences`, `pdp_cycles`, `pdp_goals`, `pdp_evidence_items`, `pdp_reflections`, `pdp_reviews`. The new views are: `v_pdp_cycle_summary`, `v_pdp_user_currency`.

Then create `src/features/pdp/` with these files:

**`src/features/pdp/types.ts`** — re-export the row types as named types: `PdpAudience`, `PdpCycle`, `PdpGoal`, `PdpEvidenceItem`, `PdpReflection`, `PdpReview`, `PdpCycleSummary`, `PdpUserCurrency`. Also export literal-union helpers for `PdpCycleStatus`, `PdpGoalStatus`, `PdpEvidenceType`, `PdpReviewType`, `PdpReviewOutcome`, `CurrencyStatus` (`'current' | 'on_track' | 'at_risk' | 'overdue'`).

**`src/features/pdp/api.ts`** — typed helpers using the shared supabase client:
- `listAudiences()`
- `getCurrentCycle(userId: string, tenantId: number | null)` (returns the most recent cycle, or null)
- `getCycleSummary(cycleId: number)`
- `listGoals(cycleId: number)`
- `listEvidence(cycleId: number)`
- `listReflections(cycleId: number)`
- `listReviews(cycleId: number)`
- `createCycle(input: Pick<PdpCycle, 'user_id' | 'tenant_id' | 'audience_code' | 'cycle_year' | 'cycle_start_date' | 'cycle_end_date' | 'target_pd_hours'>)`
- `upsertGoal(input: Partial<PdpGoal> & { cycle_id: number; title: string })`
- `logEvidence(input: Partial<PdpEvidenceItem> & { cycle_id: number; evidence_type: PdpEvidenceType; title: string; occurred_on: string })`
- `addReflection(input: { cycle_id?: number; lesson_progress_id?: number; evidence_item_id?: number; prompt?: string; response: string })`
- `signOffReview(reviewId: number)`

**`src/features/pdp/hooks.ts`** — React Query hooks wrapping the API helpers (`useCurrentCycle`, `useCycleSummary`, `useGoals`, `useEvidence`, etc).

Add a PDP entry to the `academyMenuSections` array in `src/config/navigationConfig.ts` under the existing `main` section. Use the `ClipboardList` icon from `lucide-react`. Label: "My PDP". Path: `/academy/pdp`. Do NOT edit any sidebar component file directly — the sidebar nav is driven entirely from this config file. Active-state colour: Acai `#44235F`, matching the existing Academy nav styling.

---

## Prompt 2 — /academy/pdp learner dashboard

Build the route `src/pages/academy/pdp/index.tsx` as the staff member's own PDP home page.

Wrap the page in `AcademyPageWrapper` (imported from `@/components/academy/AcademyPageWrapper`), passing `title="My Professional Development Plan"`, a subtitle showing the audience label and cycle year from `useCurrentCycle`, an appropriate icon, and `accentColour="#44235F"` (Acai).

Layout (mobile-first, single column on narrow viewports):

**Header band**
- Heading: "My Professional Development Plan"
- Subhead: audience label and cycle year, pulled from `useCurrentCycle`.
- Right-aligned: status pill (Planning / Active / Under review / Completed) using existing shadcn Badge.

**Progress card (top)**
- Large circular progress component (use recharts RadialBar) showing `percent_complete` from `v_pdp_cycle_summary`.
- Below the progress dial, three small stats stacked: Hours logged, Goals met, Reflections.
- Beside the dial: the `currency_status` traffic light from `v_pdp_user_currency` — `current` emerald, `on_track` Cyan `#23C0DD`, `at_risk` Macaron `#F9CB0C`, `overdue` Fuchsia `#ED1878`. Use Tailwind classes via the existing token map.

**Action row**
- Primary button: "Log evidence" → opens the Add Evidence sheet (Prompt 6).
- Secondary: "Add a goal" → opens the Goal sheet (Prompt 5).
- Tertiary: "Open my PDP cycle" → routes to `/academy/pdp/cycle/[cycleId]`.

**Recommended courses panel**
- Query `academy_courses` where `status = 'published'` AND `target_audience` array contains the user's PDP audience code AND the user has no `academy_enrollments` row for that course.
- Show up to 6 cards (title, `estimated_minutes`, "Start course" button). Each "Start course" inserts an `academy_enrollments` row with `source = 'pdp_recommendation'`.

**Recent evidence list**
- The 5 most recent `pdp_evidence_items` from the current cycle, with type icon, title, hours, `occurred_on`, and a small "Add reflection" link that opens the reflection drawer (Prompt 7).

**Empty state (no current cycle):** a single CTA card "Start your PDP cycle for [current_year]" → opens a small modal that creates the cycle with sensible defaults (`audience_code` from the user's primary role on the `users` table, `cycle_year` = current_year, `cycle_start_date` = today, `cycle_end_date` = today + 12 months, `target_pd_hours` = `audience.target_pd_hours_default`, `status = 'active'`).

Add the route to `src/App.tsx` using the existing `<ProtectedRoute>` pattern (no `requireSuperAdmin`).

---

## Prompt 3 — /academy/pdp/cycle/[cycleId] cycle detail page

Build the cycle detail view at `src/pages/academy/pdp/cycle/[cycleId].tsx`.

Top-of-page band: cycle title (audience label + year), status pill, edit-cycle button (drawer to change `target_pd_hours`, `cycle_end_date`, `notes`).

**Tabs** (use shadcn Tabs):

- **Overview** — re-uses the progress dial and stats from Prompt 2, plus a stacked bar chart breaking actual hours by `evidence_type` and a second mini chart splitting `vet_currency_hours` vs `industry_currency_hours`.
- **Goals** — list of `pdp_goals` for this cycle. Each row: priority badge, standard reference code (e.g. "SRTO 3.2(c)") resolved from `standards_reference`, title, status, evidence count toward `target_evidence_count`. Add/edit/delete via Prompt 5 sheet.
- **Evidence** — table of `pdp_evidence_items`. Columns: `occurred_on`, type (with icon), title, `duration_hours`, goal, status, verified. Filters by type and date range. Add row via Prompt 6.
- **Reflections** — list of `pdp_reflections` with `response` text, lesson title (resolved via `academy_lesson_progress` → `academy_lessons`) or evidence title, prompt, `created_at`. Read-only here; new reflections happen in-lesson (Prompt 7) or off an evidence row.
- **Reviews** — list of `pdp_reviews` for this cycle. Reviewee can sign off pending end-of-cycle reviews (Prompt 8 wires this).

Right-rail (desktop only): "Audit-ready export" button that calls the `pdp-export` Edge Function (Prompt 11) and surfaces a signed URL to the resulting DOCX.

Header bar action: "Close cycle" button. Confirmation modal asks for outcome notes and then sets `status = 'completed'`, `completed_at = now()`, `completed_by = auth.uid()`. Only visible when `status = 'active'` or `'under_review'`.

Add the route to `src/App.tsx`: `/academy/pdp/cycle/:cycleId` using the existing `<ProtectedRoute>` pattern.

---

## Prompt 4 — Standards picker (shared component)

Build `src/features/pdp/components/StandardsPicker.tsx`. A controlled component that queries `standards_reference` where `is_active = true`, groups by framework (`SRTO2025`, `NC2018`, `CredentialPolicy`), and renders a shadcn Command palette with grouped results. Selecting a row returns the `standard_id` (uuid) to the caller.

Display format per row: `[framework] code — title` (e.g. `SRTO 3.2(c) — Trainers undertake continuing professional development`).

This component is consumed by the goal sheet (Prompt 5) and the evidence sheet (Prompt 6) when an evidence row is being tagged to a specific Standard.

---

## Prompt 5 — Goal create/edit sheet

Build `src/features/pdp/components/GoalSheet.tsx`. A shadcn Sheet that opens from the right (desktop) or from the bottom (mobile) for both creating and editing a `pdp_goals` row.

Form fields:
- Title (required).
- Description (textarea).
- Standard reference (`StandardsPicker` from Prompt 4, optional).
- Priority (radio: High / Medium / Low).
- Target evidence count (number, default 1).
- Target hours (number, optional).
- Status (only shown when editing): Open / In progress / Met / Not met / Deferred.

Submit → `upsertGoal` then invalidate the goals query for this cycle.

Validate with zod. Show errors inline. Disable submit while in-flight. Toast on success.

---

## Prompt 6 — Add / edit evidence sheet

Build `src/features/pdp/components/EvidenceSheet.tsx`. Same Sheet pattern as Prompt 5.

Form fields:
- Evidence type (select with the 12 enum values, each shown with its icon: Academy completion, Academy certificate, External course, Workshop, Industry placement, Validation activity, Community of practice, Conference, Mentoring, Reading, Audit response, Other).
- Title (required).
- Description.
- Occurred on (date picker, required).
- Duration (hours + minutes, mapped to `duration_minutes`).
- Is formal PD? (switch, default on).
- Is industry currency? (switch, default off; visible only for trainer audience).
- Linked goal (select from this cycle's `pdp_goals`, optional).
- Standard reference (`StandardsPicker`, optional — sets the linked goal's standard if none yet).
- External provider (text, only when type is `external_course`, `workshop`, `conference`).
- External URL (text, optional).
- Document upload (private bucket `academy-evidence`, path `pdp/{user_id}/{cycle_id}/{ulid}-{filename}`). If the bucket does not yet exist, create it with `public = false`, `file_size_limit = 10485760` (10 MB), allowed MIME types `application/pdf`, `image/png`, `image/jpeg`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/msword`. Generate a signed URL with `createSignedUrl` valid for 60 seconds when the user clicks the row's "View document" link later.

For `academy_completion` and `academy_certificate` types, hide the manual fields and instead show a course picker that resolves to `source_enrollment_id` / `source_certificate_id` and pre-fills title and duration from the enrolment.

Submit → `logEvidence` then invalidate the evidence and cycle summary queries.

---

## Prompt 7 — In-lesson reflection prompt component

The lesson viewer is `src/pages/client/AcademyLessonViewerPage.tsx`. Route: `/academy/course/:slug/lesson/:lessonId`. This file uses a `showCelebration` boolean state that becomes `true` when a lesson auto-completes (via `useCompleteEnrollment` → `autoCompletedRef`).

When `showCelebration` flips to `true` (after the existing celebration modal has been displayed), trigger a non-blocking drawer titled "Quick reflection (optional)" with:
- Prompt text: "What's one thing you'll do differently because of this lesson?"
- Textarea (3 rows, character counter, max 1 000 chars).
- "Save reflection" button. "Skip" link.

On save: insert a `pdp_reflections` row with `lesson_progress_id` set, `user_id = auth.uid()`, `prompt` and `response` populated. `cycle_id` derives from the user's active cycle via `useCurrentCycle`; if no active cycle exists, still save the reflection with `cycle_id = null` and queue it to attach when the user starts a cycle (a small badge on the PDP dashboard shows unattached reflections).

The drawer must not block lesson navigation — the user can dismiss it and continue. Do not alter any existing lesson completion logic; wire the drawer as an additive side-effect only.

---

## Prompt 8 — Manager review and sign-off

Build `src/pages/academy/pdp/reviews.tsx` — a manager view listing all `pdp_cycles` where `manager_id = auth.uid()`, grouped into:
- **Awaiting review** — cycles with `status = 'under_review'` or with `cycle_end_date < today` and no `pdp_reviews` row with `review_type = 'end_cycle'`.
- **Active** — cycles with `status = 'active'`.
- **Recently closed** — last 90 days, `status = 'completed'`.

Clicking a row routes to `/academy/pdp/cycle/:cycleId?reviewMode=1` which adds a manager review composer drawer with:
- Review type (Mid cycle / End cycle / Ad hoc).
- Notes (markdown editor).
- Outcome (On track / Needs action / Completed / Not completed).
- "Save review" → insert `pdp_reviews` row.

Once submitted, the reviewee can sign off the review from their cycle detail page → "Acknowledge" button sets `signed_off_at = now()`, `signed_off_by = auth.uid()`.

Add the route to `src/App.tsx`: `/academy/pdp/reviews` using the existing `<ProtectedRoute>` pattern.

---

## Prompt 9 — Vivacity SuperAdmin workforce PDP dashboard

Build `src/pages/superadmin/WorkforcePdpPage.tsx`, restricted to Vivacity staff via `<ProtectedRoute requireSuperAdmin>` (consistent with all other `/superadmin/*` routes). Inside the component, additionally check `isVivacityTeam || isSuperAdmin` from `useRBAC()` and redirect non-qualifying users.

Layout:
- **Top filter bar:** Tenant (client RTO), Audience, Currency status (multi-select), Cycle year.
- **KPI tiles:** total staff under management, % current, % at risk, % overdue.
- **Table** powered by `v_pdp_user_currency` joined to `users` and `tenants`:
  - Columns: Staff name, Tenant, Audience, Cycle year, Target hours, Actual hours, % complete, Currency status pill, Cycle end date.
  - Row click → drawer with the staff member's cycle summary and a "View PDP" deep link to their cycle detail page.
- **Footer action:** "Export to CSV" — uses Papaparse to dump the filtered rows.

Add the route to `src/App.tsx`: `/superadmin/workforce-pdp` with `<ProtectedRoute requireSuperAdmin>`.

This is the key dashboard for the CSC team walking into a Compliance Clarity Call. Target load under 1 second for 500 rows — paginate or virtualise the table if needed.

---

## Prompt 10 — Edge Function: auto-create evidence on completion

Create a new Edge Function at `supabase/functions/pdp-auto-evidence/index.ts` using the Deno Supabase client.

**Trigger:** Called from the `onSuccess` callback of `useCompleteEnrollment` in `src/hooks/academy/useCompleteEnrollment.ts`. After the existing `supabase.rpc('complete_academy_enrollment')` call resolves successfully, invoke the edge function with:

```ts
supabase.functions.invoke('pdp-auto-evidence', {
  body: { enrollment_id: enrollmentId },
})
```

Fire-and-forget — do not `await` in the main mutation path or block the enrollment completion toast. Catch and `console.warn` any invocation error.

**Function logic:**
1. Validate the caller's JWT, resolve `auth.uid()`.
2. Load `academy_enrollments` row; bail if `user_id <> auth.uid()` and the caller is not Vivacity staff.
3. Find or create the user's current `pdp_cycles` row for the matching `tenant_id` and the current year. If none exists, create with defaults (`audience` from the user's primary role, `target_pd_hours` from the audience default, dates today → today + 12 months).
4. Resolve the course's `estimated_minutes` for duration; if null, fall back to summed `academy_lessons.estimated_minutes`.
5. Insert a `pdp_evidence_items` row: `evidence_type = 'academy_completion'`, `title = course.title`, `occurred_on = enrollment.completed_at::date`, `duration_minutes`, `source_enrollment_id = enrollment.id`, `status = 'verified'`, `verified_by = auth.uid()`.
6. If an `academy_certificates` row exists for the same enrollment, also insert a second `pdp_evidence_items` row with `evidence_type = 'academy_certificate'` and `source_certificate_id` set.
7. Write one `audit_log` row from inside the function describing the auto-evidence creation.
8. Return the new evidence item ID(s).

**Idempotent:** if an evidence row with this `source_enrollment_id` already exists, return the existing ID and skip insert.

Store no secrets in the function except the service role key (already provided by Supabase). Validate the body shape with zod.

Use the existing `_shared/cors.ts` and `_shared/supabase-client.ts` helpers.

---

## Prompt 11 — Edge Function: audit-ready PDP export

Create `supabase/functions/pdp-export/index.ts`. Generates a DOCX bundle for a single PDP cycle, suitable for ASQA audit evidence.

**Inputs (POST body):** `cycle_id`.

**Function logic:**
1. Validate JWT. Bail unless caller is the cycle owner, manager, a tenant admin, or Vivacity staff.
2. Load: cycle, audience, all goals (with resolved `standards_reference`), all evidence (with course/cert titles resolved), all reflections, all reviews.
3. Render a DOCX using `docx-templates` via the npm specifier `npm:docx-templates`. Template stored in `doc-templates` bucket at `pdp/pdp-cycle-export-v1.docx` (template to be authored separately — see note below).
4. Merge fields: `{{LearnerName}}`, `{{LearnerEmail}}`, `{{TenantName}}`, `{{AudienceLabel}}`, `{{CycleYear}}`, `{{CycleStartDate}}`, `{{CycleEndDate}}`, `{{TargetHours}}`, `{{ActualHours}}`, `{{PercentComplete}}`, `{{Goals}}` (table loop), `{{Evidence}}` (table loop), `{{Reflections}}` (table loop), `{{Reviews}}` (table loop), `{{IssuedAt}}`, `{{IssuedBy}}`.
5. Write the rendered file to `generated-docs` bucket at `pdp/{user_id}/{cycle_id}/cycle-export-{ISO_date}.docx`.
6. Return a signed URL valid for 5 minutes.
7. Insert one `audit_log` row recording the export.

Use the existing `_shared/cors.ts` and `_shared/supabase-client.ts` helpers. If those helpers don't exist in the functions directory, inline minimal CORS handling and a Supabase client created with the service role key from `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`.

**Template authoring note:** The DOCX template uses Vivacity branding (Purple `#7130A0`, Fuchsia `#ED1878`, Cyan `#23C0DD` accents; Anton for titles, Binate for headings, Calibri for body). Header strap: "Vivacity Coaching & Consulting — Professional Development Plan Export". Footer: page number + "Generated `{{IssuedAt}}` for audit evidence under SRTO 2025 Standards 3.1, 3.2, 3.3 and the Credential Policy." This template can be authored separately; the function code goes in first.

---

## Prompt 12 — Tenant admin "My staff PDPs" view (Phase 1.5)

Build `src/pages/tenant/staff-pdps.tsx` (new directory — `src/pages/tenant/` does not yet exist). This view is visible to users with a `tenant_users` row of `role = 'admin'` or `role = 'owner'` for the active tenant.

Use `useClientTenant()` from `@/contexts/ClientTenantContext` to get `activeTenantId`. This is automatically filtered by the active tenant — the user only sees rows for their own client RTO.

Layout mirrors the Vivacity SuperAdmin workforce dashboard (Prompt 9) but scoped to the single tenant: same filter bar (minus the tenant filter), same KPI tiles, same table.

Add an "Export audit pack" button that loops over staff in the filtered table and zips the individual `pdp-export` DOCXs into a single ZIP, returned via a signed URL. If `jszip` is not yet in dependencies, install it.

Add the route to `src/App.tsx`: `/tenant/staff-pdps` using the existing `<ProtectedRoute>` pattern (no `requireSuperAdmin` — the tenant admin gate is inside the component).

This is technically already permitted by RLS (tenant admins view their tenant policies on every PDP table); this prompt just builds the UI surface. No new schema or function work.

---

## Done-when checklist

**A staff member can:**
- [ ] See their current cycle's progress on `/academy/pdp`
- [ ] Add goals against Standards
- [ ] Log evidence manually
- [ ] Have evidence auto-created when they complete an Academy course
- [ ] Write a reflection inside a lesson and have it land against the cycle
- [ ] Export an audit-ready DOCX

**A manager can:**
- [ ] See cycles where they are `manager_id`
- [ ] Write reviews
- [ ] Have those reviews acknowledged by the reviewee

**A Vivacity SuperAdmin can:**
- [ ] See workforce PDP currency across all client RTOs
- [ ] Filter by tenant, audience, currency status
- [ ] Click into any staff member's cycle

**A tenant admin can:**
- [ ] See their own staff's PDPs
- [ ] Export a bundled audit pack

**RLS regression checks (run before each merge):**
- A staff member at Client A cannot see PDP data for Client B.
- An unauthenticated request to any `pdp_*` endpoint returns zero rows.
- A consultant assigned to Client A as a `tenant_users` admin sees Client A's PDPs but not Client C's.

---

## What changed from Angela's original draft

| Prompt | Change |
|---|---|
| 1 | Nav: added explicit instruction to edit `academyMenuSections` in `src/config/navigationConfig.ts` rather than a sidebar component. |
| 2 | Shell component: named `AcademyPageWrapper` exactly (including `accentColour` Australian spelling); added route registration instruction. |
| 7 | Lesson viewer: corrected path to `src/pages/client/AcademyLessonViewerPage.tsx` and route to `/academy/course/:slug/lesson/:lessonId`; wired to `showCelebration` state instead of a hypothetical completion hook. |
| 10 | Trigger: corrected to `useCompleteEnrollment.ts` `onSuccess` callback using `supabase.functions.invoke`; clarified fire-and-forget pattern. |
| 11 | Shared helper: corrected `_shared/supabase.ts` → `_shared/supabase-client.ts`. |
| 12 | Tenant hook: named `useClientTenant()` from `ClientTenantContext` with `activeTenantId`; added route registration and new-directory note. |
| 9 | Guard: changed to `<ProtectedRoute requireSuperAdmin>` + inner `useRBAC()` check, consistent with existing `/superadmin/*` pattern. |
