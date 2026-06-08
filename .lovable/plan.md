# Plan: Onboarding Hub (Step 6 of New Starter Wizard)

Internal admin-only. Zero client exposure. No changes to Steps 1–5 logic, `staff_provisioning_rules`, or `dd_staff_role`.

## 1. Database migration

### 1a. `app_settings` — two new nullable columns (single-row config)
- `staff_induction_video_url text null`
- `staff_onboarding_workbook_url text null`

(Stay consistent with the existing column-per-setting pattern on `app_settings`. No new `key/value` table.)

### 1b. `staff_provisioning_runs` — three new tracking column groups
For each of the three hub deliverables, add `_at` + `_by` + (where relevant) ack columns:

- `induction_video_sent_at timestamptz null`
- `induction_video_sent_by uuid null` (FK → users.user_uuid)
- `induction_video_watched_at timestamptz null`
- `onboarding_workbook_sent_at timestamptz null`
- `onboarding_workbook_sent_by uuid null`
- `onboarding_workbook_returned_at timestamptz null`
- `welcome_email_sent_at timestamptz null`
- `welcome_email_sent_by uuid null`
- `welcome_email_notes text null`

These are denormalized convenience columns for the three hero cards. The full 9-step checklist still lives in `lifecycle_checklist_instances`. UI writes to both (column + matching template instance) when the user ticks a hero card.

### 1c. Seed `lifecycle_checklist_templates` for new `lifecycle_type = 'staff_onboarding'`
Insert 9 rows (idempotent: `ON CONFLICT DO NOTHING` keyed by `(lifecycle_type, sort_order)` or pre-check). Categories and titles exactly as specified in the brief (sort_order 10–90, `is_default=true`, `is_active=true`, `responsible_role='admin'`).

### 1d. Trigger: auto-create instances on provisioning success
- Function `public.tg_seed_staff_onboarding_checklist()` (`security definer`, `set search_path = ''`).
- Fires `AFTER UPDATE` on `public.staff_provisioning_runs` when `OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'provisioned'`.
- Also covers `AFTER INSERT` where `NEW.status = 'provisioned'` (defensive).
- Inserts one `lifecycle_checklist_instances` row per active `staff_onboarding` template, with `provisioning_run_id = NEW.id`, `target_user_id = NEW.target_user_id`, `assigned_to = NEW.requested_by`.
- Idempotent guard: skip if any rows already exist for that `provisioning_run_id` + `lifecycle_type='staff_onboarding'`.

No storage bucket — using URL approach (option a) per brief recommendation.

### 1e. RLS (restrictive, internal-only)
- `app_settings`: existing policies remain.
- New columns on `staff_provisioning_runs`: covered by existing RLS (already SuperAdmin-only). Confirm no client role can read.
- `lifecycle_checklist_instances`: existing RLS. For `lifecycle_type='staff_onboarding'` rows, add a `RESTRICTIVE` policy that limits SELECT/UPDATE to internal staff (`has_role(auth.uid(),'superadmin')` or equivalent helper present in project) regardless of `tenant_id` (which will be null for these rows).

## 2. Wizard changes (`src/pages/admin/NewStarterWizard.tsx`)

- Widen `type Step = 1|2|3|4|5|6`.
- Header text `Step {step} of 6` (currently `of 5`).
- Stepper: append a 6th node "Onboarding Hub".
- Step 5 (Save & provision) success block: replace "Done" with "Next: Onboarding Hub →" advancing to step 6. Keep "Send team-leader email" button.
- New `{step === 6 && <OnboardingHubStep runId={runId} form={form} />}` block.
- Footer: keep nav arrows for `step < 6`; on step 6 show "Save & Close" → `/admin/team-users` and "Save & View Team Member" → `/admin/users/<target_user_id>` (or existing route).
- Guard: step 6 is reachable only when `runId` exists (status `provisioned` or `partial`). If user tries to advance from step 5 without a successful run, keep current behaviour.

## 3. New UI components

- `src/components/admin/team-users/OnboardingHub.tsx` — the reusable hub view, takes `runId`. Used both inline in Step 6 and on the run detail page.
- `src/components/admin/team-users/OnboardingHub/InductionVideoCard.tsx`
- `src/components/admin/team-users/OnboardingHub/WorkbookCard.tsx`
- `src/components/admin/team-users/OnboardingHub/WelcomeEmailCard.tsx`
- `src/components/admin/team-users/OnboardingHub/ChecklistPanel.tsx` — grouped-by-category, collapsible, ticks `lifecycle_checklist_instances`.
- `src/components/admin/team-users/OnboardingHub/CompletionRing.tsx` — `X of 9` progress.
- `src/hooks/useOnboardingHub.ts` — fetch run, instances, settings; mutations for marking sent/watched/returned (updates both column on run + matching checklist instance in one RPC or two sequential calls).
- `src/hooks/useAppSettings.ts` — if no existing reader for `staff_induction_video_url` / `staff_onboarding_workbook_url`, add a thin hook (or extend an existing one).

Status badge logic per card: Not Sent → Sent (when `*_sent_at` set) → Watched/Returned (when ack column set).

Placeholder when URL null: card body says "… not yet configured. Add the URL in System Config." with a `<Link to="/admin/system-config">` (or whatever the existing admin settings route is — confirm during implementation).

## 4. Persistence after wizard closes

- Add `View Onboarding Hub` action on the team member row in `src/pages/TeamUsers.tsx` (or detail page) — opens a route like `/admin/team-users/runs/:runId/onboarding` which renders `<OnboardingHub runId={…} />` inside `DashboardLayout`.
- New page file: `src/pages/admin/OnboardingHubPage.tsx`.
- Register route in `src/App.tsx`.

## 5. System Config integration

- Add two fields to the existing admin System Config / settings page (locate during implementation — likely `src/pages/IntegrationSettings.tsx` or a sibling). Labelled "Staff Induction Video URL (internal)" and "Staff Onboarding Workbook URL (internal)" with helper text noting internal-only use. Save via update to the single `app_settings` row.

## 6. Files to create / modify

**Create**
- `supabase/migrations/<ts>_staff_onboarding_hub.sql`
- `src/components/admin/team-users/OnboardingHub.tsx`
- `src/components/admin/team-users/OnboardingHub/InductionVideoCard.tsx`
- `src/components/admin/team-users/OnboardingHub/WorkbookCard.tsx`
- `src/components/admin/team-users/OnboardingHub/WelcomeEmailCard.tsx`
- `src/components/admin/team-users/OnboardingHub/ChecklistPanel.tsx`
- `src/components/admin/team-users/OnboardingHub/CompletionRing.tsx`
- `src/hooks/useOnboardingHub.ts`
- `src/pages/admin/OnboardingHubPage.tsx`

**Modify**
- `src/pages/admin/NewStarterWizard.tsx` — add Step 6, update stepper, update footer
- `src/App.tsx` — register new route
- `src/pages/TeamUsers.tsx` — add "View Onboarding Hub" action
- System Config page (TBD exact file) — add the two URL fields
- `src/hooks/useAppSettings.ts` — add or extend (if needed)

## 7. Decisions required from Angela / Dave

1. **System Config home** — which existing admin page hosts the two new URL fields? (Settings, Integrations, or a new "Staff Onboarding" section.)
2. **"Save & View Team Member" target route** — confirm correct path for a team member profile (`/admin/users/:uuid`? `/admin/team-users/:uuid`?).
3. **"Admin" role definition** for the checklist's `responsible_role='admin'` — confirm it maps to existing `dd_lifecycle_responsible_role` codes; if not, seed a new `admin` row in `dd_lifecycle_responsible_role` in the same migration.
4. **Workbook hosting** — confirm option (a) URL-only is acceptable (no Supabase Storage bucket). If they later want upload, that's a follow-up.
5. **Checklist on `partial` runs** — should the trigger also fire when status becomes `partial`, or only `provisioned`? Brief says only `provisioned` — confirming.
6. **Re-run behaviour** — if a run is re-executed (Redo Setup), should existing checklist instances be reset, kept, or duplicated under the new run? Current plan: keep — new run gets its own `provisioning_run_id` so a fresh set is created automatically; old instances stay for audit.

Stop here. Awaiting approval before implementation.
