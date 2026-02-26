ALTER TABLE stage_team_tasks ADD COLUMN is_recurring boolean NOT NULL DEFAULT false;
ALTER TABLE package_staff_tasks ADD COLUMN is_recurring boolean NOT NULL DEFAULT false;