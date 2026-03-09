

## Plan: Key Event Date Tracking for Recurring Stages

### Summary

Add an `event_conducted_date` column to `stage_instances` and an `is_key_event` flag to `staff_tasks`. For recurring stages, display the event date inline and allow manual editing. Surface the latest key event dates in the Time Summary card on the Tenant Overview.

### Database Changes (1 migration)

1. **`stage_instances`** -- Add `event_conducted_date DATE NULL`
2. **`staff_tasks`** -- Add `is_key_event BOOLEAN NOT NULL DEFAULT false`
3. **DB trigger** on `staff_task_instances`: When a task with `is_key_event = true` is marked Complete (status_id = 2 or 4), set `stage_instances.event_conducted_date = CURRENT_DATE` on the parent stage instance. If reverted, recalculate from remaining completed key-event tasks (latest date or NULL).

### Frontend Changes

#### 1. StageDetailSection -- Show event date for recurring stages
- Add `isRecurring` prop to `StageDetailSectionProps`
- Change visibility: currently only renders when `stageStatus === 3`. For recurring stages, **also** render the "Event Conducted Date" picker regardless of completion status (so it can be manually set/updated at any time)
- Add a second date picker for `event_conducted_date` (distinct from the existing `completion_date` picker)
- Save writes to `stage_instances.event_conducted_date` with audit logging
- Label: "Event Conducted Date" with helper text "Actual date this event was performed"

#### 2. Stage instance data hooks
- **`useClientPackageInstances.tsx`**: Include `event_conducted_date` in the stage instance select query (line ~242)
- **`useStaffTaskInstances.ts`**: Include `is_key_event` from joined `staff_tasks` (line ~78)
- Pass `isRecurring` and `eventConductedDate` through to `StageDetailSection`

#### 3. ClientTimeSummaryCard -- "Key Events" section
- After the membership year section (~line 145), add a new "Key Events" block
- Query: fetch `stage_instances` joined to `stages` where `stage_instances.is_recurring = true` AND `event_conducted_date IS NOT NULL`, filtered by the tenant's active package instances
- Display as a compact list: "Last CHC: 12 Oct 2025", "Last AV: 3 Sep 2025", etc.
- Use stage `short_name` or `title` for the label

#### 4. Admin Stage Detail -- `is_key_event` toggle on staff tasks
- In `useStageTemplateContent.tsx`: include `is_key_event` in the staff task type and queries
- In the Admin Stage Detail staff tasks list: add a small key/star icon toggle for `is_key_event`, only visible when the parent stage `is_recurring = true`

#### 5. Visual indicators
- In the client stage task list (`StageStaffTasks.tsx`): show a small key badge next to tasks where `is_key_event = true` so users know which task drives the event date

### Files Changed
- 1 new migration SQL
- `src/components/client/StageDetailSection.tsx` -- add event date picker for recurring stages
- `src/hooks/useClientPackageInstances.tsx` -- fetch `event_conducted_date`
- `src/hooks/useStaffTaskInstances.ts` -- fetch `is_key_event`
- `src/hooks/useStageTemplateContent.tsx` -- include `is_key_event`
- `src/components/client/ClientTimeSummaryCard.tsx` -- new Key Events section
- `src/pages/AdminStageDetail.tsx` -- `is_key_event` toggle on staff tasks
- `src/components/client/StageStaffTasks.tsx` -- key event badge

