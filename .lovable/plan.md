## Completed: Key Event Date Tracking for Recurring Stages

Added `event_conducted_date` column to `stage_instances` and `is_key_event` flag to `staff_tasks`. When a staff task marked as key event is completed, a DB trigger auto-updates the parent stage's event conducted date. For recurring stages, the event date picker is shown regardless of completion status, allowing manual override.

### Database Changes
- `staff_tasks.is_key_event` (boolean, default false)
- `stage_instances.event_conducted_date` (date, nullable)
- Trigger `trg_staff_task_event_conducted` on `staff_task_instances` — auto-sets `event_conducted_date` when key-event task is completed

### Frontend Changes
- **StageDetailSection**: Shows "Event Conducted Date" picker for recurring stages regardless of status
- **useStaffTaskInstances**: Includes `is_key_event` from staff_tasks
- **useStageTemplateContent**: Includes `is_key_event` in StageTeamTask type
- **StageStaffTasks**: Key badge (KeyRound icon) on tasks where `is_key_event = true`
- **AdminStageDetail**: Toggle for `is_key_event` on team tasks (only visible for recurring stages)
- **PackageStagesManager**: Passes `isRecurring` and `eventConductedDate` to StageDetailSection
- **ClientTimeSummaryCard**: "Key Events" section showing latest event dates for recurring stages
