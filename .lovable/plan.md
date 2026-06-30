## Exit Interview Feature

### 1. Database migration

Create `engagement_exit_interviews` table with the supplied SQL — one row per offboarding engagement, JSONB `responses`, submit-locking via `is_submitted`, RLS allowing Vivacity admins full read and the linked staff member to insert/update/select their own (until submitted), plus standard `created_at`/`updated_at` and an updated_at trigger.

### 2. New page `/my-exit-interview`

New file `src/pages/MyExitInterview.tsx`, registered in `src/App.tsx` inside `<ProtectedRoute>` (auth required, no admin gate).

Flow:
- Query `staff_engagements` filtered by `linked_unicorn_user_id = auth.uid()`, `type = 'offboarding'`, `status != 'cancelled'`, ordered by `created_at desc`, take first.
- If none → friendly empty-state card.
- Else fetch `engagement_exit_interviews` by `engagement_id`.
  - `is_submitted = true` → read-only summary with "Thank you" banner.
  - Else → render the form, hydrating from any existing draft row.

Form structure (8 sections, keys exactly as specified):
- S1–S6, S8: textarea questions, autosave on blur via upsert (`onConflict: engagement_id`).
- S7: ten 1–5 rating rows. Render as a 5-button group labelled 1=Strongly Disagree … 5=Strongly Agree, stored as integer.
- `s8_comments` optional "Additional Comments" textarea.
- Submit button at bottom with warning banner "Once submitted, your responses cannot be edited…"; on submit set `is_submitted=true`, `submitted_at=now()`, `submitted_by=auth.uid()`, then refetch to flip to read-only view.

Implementation notes:
- Use existing `supabase` client and `useAuth` for `auth.uid()`.
- Local `responses` state mirrors JSONB; debounce-free, blur-triggered upsert keeps it simple.
- Use shadcn `Card`, `Textarea`, `Button`, `Alert` for consistency with the rest of admin pages.

### 3. Exit Interview tab on `StaffEngagementDetail`

`src/pages/admin/StaffEngagementDetail.tsx` was recently de-tabbed (only checklist remains). Reintroduce a minimal `Tabs` wrapper **only when `engagement.type === "offboarding"`** so the page still renders identically for onboarding.

- Tabs: "Checklist" (existing content) + "Exit Interview".
- Exit Interview tab query: `engagement_exit_interviews` by `engagement_id`, plus a join/lookup against `public.users` for the `submitted_by` display name.
- If submitted: render grouped, read-only response cards per section, with the original question text as the label and rating numbers shown for S7. Header line: "Submitted by {name} on {date}".
- If not submitted: Card with message and a copyable `/my-exit-interview` link (absolute URL using `window.location.origin`). Use a small `Button` with `Copy` icon and toast confirmation.

### Out of scope
No changes to other tabs, checklist logic, invite/revoke/link/cancel/delete flows, `StaffEngagements.tsx`, `staffEngagementChecklists.ts`, or unrelated routes.

### Technical details

- Table grants: `GRANT ALL ON public.engagement_exit_interviews TO authenticated, service_role` (per supplied SQL).
- Updated-at trigger: reuse existing `public.update_updated_at_column()` if present, otherwise create.
- Question text constant: define a single `EXIT_INTERVIEW_SCHEMA` array (sections → questions with key/label/type) in a shared module (e.g. `src/pages/exitInterviewSchema.ts`) so both the staff form and the admin read-only view render identical labels from one source.
- Route registration: add `<Route path="/my-exit-interview" element={<ProtectedRoute><MyExitInterview /></ProtectedRoute>} />` near other authenticated user routes in `App.tsx`.
- The Supabase types file regenerates after migration approval, so the page/tab code lands after the migration runs.
