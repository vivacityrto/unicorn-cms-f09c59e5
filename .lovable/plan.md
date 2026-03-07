## Completed: Create `dd_stage_types` Lookup Table

Created `dd_stage_types` table with 6 types (onboarding, delivery, documentation, support, monitoring, offboarding) including `is_milestone` column for progress metrics. Replaced all 7 hardcoded `STAGE_TYPE_OPTIONS` arrays with the `useStageTypeOptions` hook. Updated progress logic to use `is_milestone` fallback and added `monitoring` to auto-default logic.
