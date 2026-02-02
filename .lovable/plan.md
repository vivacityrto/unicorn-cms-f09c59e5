
# Include Vivacity Staff in EOS Meeting Attendees

## Problem Summary

The "Seed from EOS Roles" button only pulls users from the `eos_user_roles` table, which contains tenant-specific EOS role assignments. Vivacity internal staff (SuperAdmins and Team Members) are not being added because they don't have entries in this table.

Your team has 14 Vivacity staff members who should be included as meeting attendees:
- 6 Super Admins
- 8 Team Members

## Solution

Update the `seed_meeting_attendees_from_roles` RPC function to also include all Vivacity internal staff as attendees.

## Implementation

### Database Migration

Create a new migration that updates the `seed_meeting_attendees_from_roles` function to:

1. First, seed from `eos_user_roles` (existing behavior for Visionary/Integrator/Core Team)
2. Additionally, seed all Vivacity staff from the `users` table where:
   - `user_type = 'Vivacity Team'` OR
   - `unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')`

### Updated SQL Logic

```sql
-- STEP 1: Insert from eos_user_roles (existing logic)
INSERT INTO public.eos_meeting_attendees (...)
SELECT ...
FROM public.eos_user_roles ur
WHERE ur.tenant_id = v_meeting.tenant_id
  AND NOT EXISTS (...);

-- STEP 2: Insert Vivacity staff (NEW)
INSERT INTO public.eos_meeting_attendees (
  meeting_id, user_id, role_in_meeting, attendance_status, created_at, updated_at
)
SELECT
  p_meeting_id,
  u.user_uuid,
  'core_team'::meeting_role,
  'invited'::meeting_attendance_status,
  NOW(),
  NOW()
FROM public.users u
WHERE u.user_type = 'Vivacity Team'
  AND u.disabled IS NOT TRUE
  AND NOT EXISTS (
    SELECT 1 FROM public.eos_meeting_attendees a
    WHERE a.meeting_id = p_meeting_id AND a.user_id = u.user_uuid
  )
ON CONFLICT DO NOTHING;
```

### Role Mapping for Vivacity Staff

| User Role | Meeting Role |
|-----------|--------------|
| Super Admin | core_team |
| Team Leader | core_team |
| Team Member | core_team |

All Vivacity staff will be added as "Core Team" attendees, distinguishing them from tenant-specific roles like Visionary or Integrator.

## Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/[timestamp]_seed_vivacity_staff_attendees.sql` | Update RPC to include Vivacity staff |

## Expected Outcome

After implementation:
- Clicking "Seed from EOS Roles" will add all 14 Vivacity staff members to the meeting
- The attendance panel will show all internal team members
- Quorum calculations will include Vivacity staff presence
- Manual add/remove functionality remains unchanged

## Technical Note

This approach ensures that:
- Vivacity staff are available for ALL tenant meetings (global access)
- Tenant-specific roles from `eos_user_roles` are still respected
- No duplicate attendees are created (ON CONFLICT handling)
- Disabled users are excluded from seeding
