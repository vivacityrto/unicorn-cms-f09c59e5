

## Replace `meeting_attendance_status` Enum with `dd_meeting_attendance_status` Lookup Table

### Why
PostgreSQL enums are rigid -- adding/removing values requires migrations and can't be managed through the existing Code Tables admin UI. Moving to a `dd_` lookup table makes attendance statuses manageable like all other dropdown values in the system.

### What Changes

#### 1. Database Migration (single migration)

**a) Create the `dd_meeting_attendance_status` table**

Standard `dd_` structure matching other code tables:
- `id` (serial PK)
- `label` (text) -- display name e.g. "Invited", "Present", "Absent"
- `value` (text, unique) -- stored value e.g. "invited", "attended", "absent"
- `description` (text, nullable)
- `sort_order` (integer)
- `is_active` (boolean, default true)
- `created_at` / `updated_at` timestamps

Seed with all current values plus `absent`:
`invited`, `accepted`, `declined`, `attended`, `late`, `left_early`, `no_show`, `absent`

**b) Alter `eos_meeting_attendees.attendance_status` column**

- Change from `meeting_attendance_status` enum to `TEXT`
- Keep default `'invited'`
- Add a foreign key or check constraint referencing `dd_meeting_attendance_status.value`

**c) Recreate all 6 affected RPCs** removing `::meeting_attendance_status` casts, using plain text strings instead:

- `update_meeting_attendance` -- also fix the `p_user_id::TEXT` audit bug (entity_id is UUID)
- `add_meeting_attendee`
- `add_meeting_guest`
- `mark_all_present`
- `seed_meeting_attendees_from_roles`
- `calculate_quorum` and `start_meeting_with_quorum_check` (these compare string values -- no cast changes needed, but parameter types may reference the enum)

**d) Drop the old enum type** after column and functions are migrated.

**e) Add RLS policies** on `dd_meeting_attendance_status` -- SELECT for authenticated users (read-only for UI), full CRUD for Vivacity team (via Code Tables admin).

#### 2. Frontend: `src/hooks/useMeetingAttendance.tsx`

- Change `AttendanceStatus` from a hardcoded union type to `string`
- The hook otherwise stays the same -- it passes the status string to RPCs

#### 3. Frontend: `src/components/eos/AttendancePanel.tsx`

- Fetch status options from `dd_meeting_attendance_status` table instead of hardcoding `statusConfig`
- Build `statusConfig` dynamically from the fetched rows
- Add `absent` to icon/color mapping
- The `<Select>` dropdown items are rendered from the fetched options

#### 4. Frontend: Other files with string comparisons

These files compare `attendance_status` to string literals like `'attended'`, `'late'`, `'invited'` -- these continue to work unchanged since the column becomes TEXT and the values remain the same:
- `src/hooks/useNextMeeting.tsx`
- `src/hooks/useLeadershipDashboard.tsx`
- `src/components/eos/LiveMeetingView.tsx`
- `src/components/eos/OnlineUsersIndicator.tsx`

No changes needed in these files.

#### 5. Update `docs/eos-meetings-attendance.md`

Update the `attendance_status` column documentation to note it's now a TEXT column referencing `dd_meeting_attendance_status`, and add `absent` to the list of values.

### Files Modified

- New SQL migration file
- `src/hooks/useMeetingAttendance.tsx`
- `src/components/eos/AttendancePanel.tsx`
- `docs/eos-meetings-attendance.md`

### Not Changed

- `src/integrations/supabase/types.ts` -- auto-generated, will update on next type generation
- RPCs that only compare string values without enum casts (no functional change needed)

