# EOS Meetings – Attendance, Presence & Quorum

## Data Model

### Tables

| Table | Purpose |
|---|---|
| `eos_meeting_attendees` | Persisted attendance roster per meeting. Source of truth for "present". |
| `eos_meeting_participants` | Legacy/supplementary participant data (role assignments). |

### Key Columns on `eos_meeting_attendees`

| Column | Type | Notes |
|---|---|---|
| `meeting_id` | uuid FK | References `eos_meetings.id` |
| `user_id` | uuid FK | References `users.user_uuid` |
| `role_in_meeting` | enum | `owner`, `attendee`, `guest`, `visionary`, `integrator`, `core_team` |
| `attendance_status` | enum | `invited`, `accepted`, `declined`, `attended`, `late`, `left_early`, `no_show` |
| `joined_at` | timestamptz | Set when status changes to `attended` or `late` |
| `left_at` | timestamptz | Set when status changes to `left_early` |
| `marked_by` | uuid | Who changed the status |
| `seat_id` | uuid | Optional link to accountability seat |

**Unique constraint**: `(meeting_id, user_id)` — one record per user per meeting.

## Presence Channel (Online Detection)

Uses **Supabase Realtime Presence** on channel `meeting:<meeting_id>`.

### Payload tracked per user

```json
{
  "user_id": "<uuid>",
  "name": "First Last",
  "avatar_url": "...",
  "online_at": "<ISO timestamp>"
}
```

### Client behaviour

- On meeting page load → join channel, track self
- On tab close / unload → automatic leave (Supabase handles)
- Heartbeat lost → user disappears from presence state within ~30s

### Online ≠ Present

| Concept | Source | Stored in DB? |
|---|---|---|
| **Online** | Realtime Presence (ephemeral) | No |
| **Present** | `eos_meeting_attendees.attendance_status = 'attended'` | Yes |

**Quorum uses "present" (DB), not "online" (presence).**

### Auto-attendance sync

When a user appears online during a live meeting:
1. If they're already an attendee → status is updated to `attended` (if not already)
2. If they're not an attendee → they're added as a `guest` with status `attended`

This runs in `AttendancePanel` and `LiveMeetingView` via `useEffect`.

## Quorum Rules

### Default: non-blocking

**Owner absence never blocks a meeting.** It shows a warning badge:
> "Owner not present — Facilitator controls the meeting"

### Rules by meeting type

| Meeting Type | Quorum Rule | Hard Block? |
|---|---|---|
| **L10** | ≥ 1 attendee present | No |
| **Same Page** | Visionary AND Integrator present | **Yes** |
| **Quarterly** | 80% of core team present | No |
| **Annual** | Visionary AND Integrator present | No (but warned) |
| **Other** | ≥ 1 attendee present | No |

### Meeting start flow

1. `start_meeting_with_quorum_check` RPC is called
2. Quorum is calculated via `calculate_quorum`
3. If **Same Page** and quorum not met → blocked, cannot start
4. All other types → meeting starts, quorum status is recorded
5. If quorum not met, meeting status shows `meeting_started_without_quorum` in audit

### Facilitator fallback

If owner is absent:
- Facilitator controls the meeting
- If no facilitator assigned, any present Vivacity Super Admin can act as facilitator
- `isFacilitator` defaults to `true` if no participants are set

## RLS Policies

All on `eos_meeting_attendees`:

| Policy | Operation | Condition |
|---|---|---|
| `vivacity_select_attendees` | SELECT | `is_vivacity_team_safe(auth.uid())` |
| `vivacity_insert_attendees` | INSERT | `is_vivacity_team_safe(auth.uid())` |
| `vivacity_update_attendees` | UPDATE | `is_vivacity_team_safe(auth.uid())` |
| `vivacity_delete_attendees` | DELETE | `is_vivacity_team_safe(auth.uid())` |

Only Vivacity team members (Super Admin, Team Leader, Team Member) can access attendance data.

## RPC Functions

| Function | Purpose |
|---|---|
| `calculate_quorum(meeting_id)` | Returns quorum status with issues array |
| `start_meeting_with_quorum_check(meeting_id, override_reason)` | Starts meeting, records quorum state |
| `update_meeting_attendance(meeting_id, user_id, status, notes)` | Upsert attendance status |
| `mark_all_present(meeting_id)` | Batch-mark all invited as attended |
| `add_meeting_guest(meeting_id, user_id, notes)` | Add guest during live meeting |
| `add_meeting_attendee(meeting_id, user_id, role)` | Add attendee (works during scheduled AND in_progress) |
| `remove_meeting_attendee(meeting_id, user_id)` | Remove attendee |
| `seed_meeting_attendees_from_roles(meeting_id)` | Populate from EOS role assignments |

## User Picker

All EOS meeting user pickers use `useVivacityTeamUsers()` hook, which returns only users with roles: Super Admin, Team Leader, Team Member. Client users are never shown in EOS contexts.
