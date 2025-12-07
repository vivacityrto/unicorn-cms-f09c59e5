# EOS Phase 2: Level 10 Meeting Core

## Overview
Phase 2 implements the core Level 10 meeting functionality with real-time collaboration, agenda templates, meeting scheduling, and live meeting flow with participant management.

## Features Implemented

### 1. Agenda Templates
- **Location**: `/eos/meetings` → "Manage Templates" button
- Create custom agenda templates with ordered segments
- Each segment has a name and duration in minutes
- Default "Standard Level 10" template auto-created for each tenant
- Segments: Segue (5m), Scorecard (5m), Rocks (5m), Headlines (5m), To-Dos (5m), IDS (60m), Conclude (5m)

### 2. Meeting Scheduling
- **Component**: `MeetingScheduler` modal
- Select template, facilitator, date/time, duration
- Automatically instantiates meeting segments from template
- Creates meeting participants with roles (Leader/Member/Observer)
- RPC function: `create_meeting_from_template()`

### 3. Live Meeting View
- **Route**: `/eos/meetings/:meetingId/live`
- **Features**:
  - Left panel: Agenda with current segment highlighted
  - Real-time segment progression
  - Headlines panel (add/delete, good news vs FYI)
  - Presence tracking (online users count)
  - Facilitator controls (advance segment button)

### 4. Real-Time Sync
- **Technology**: Supabase Realtime (Postgres Changes + Presence)
- **Events**:
  - `eos_meeting_segments` changes (start/complete)
  - `eos_headlines` changes (create/delete)
  - User presence (join/leave)
- **Channel**: `meeting:{meeting_id}`
- Updates appear across all connected clients within <1s

### 5. Security & Access Control
- **Roles**: Leader (facilitator), Member, Observer
- **RLS Policies**:
  - Only meeting participants can view/join
  - Only Leaders can advance segments
  - Users can only delete their own headlines
  - All operations tenant-scoped
- **Audit**: All changes logged to `audit_eos_events`

## Database Schema

### New Tables
1. **eos_agenda_templates**: Template definitions with segments JSON
2. **eos_meeting_participants**: User-meeting mapping with roles
3. **eos_meeting_segments**: Instantiated agenda items with timing
4. **eos_headlines**: Meeting headlines (good news/FYI)

### New Enums
- `eos_meeting_role`: Leader, Member, Observer
- `eos_segment_type`: Segue, Scorecard, Rocks, Headlines, Todos, IDS, Conclude

### RPC Functions
- `create_meeting_from_template()`: Creates meeting + participants + segments
- `advance_segment()`: End current, start next (facilitator-only)
- `has_meeting_role()`: Security helper for RLS
- `is_meeting_participant()`: Security helper for RLS

## Architecture

### Frontend Components
```
src/components/eos/
├── MeetingScheduler.tsx      # Schedule new meetings
├── AgendaTemplateEditor.tsx  # Create/edit templates
└── LiveMeetingView.tsx       # Real-time meeting UI

src/hooks/
├── useEos.tsx                # Meetings, Rocks, Issues, Todos
├── useEosAgendaTemplates.tsx # Template CRUD
├── useEosMeetingSegments.tsx # Segments + advance
├── useEosHeadlines.tsx       # Headlines CRUD
└── useMeetingRealtime.tsx    # Real-time sync
```

### Real-Time Flow
1. User joins meeting → subscribes to `meeting:{id}` channel
2. User presence tracked automatically
3. DB changes trigger postgres_changes events
4. React Query caches invalidated
5. UI updates for all connected clients

## Usage

### Schedule a Meeting
1. Navigate to `/eos/meetings`
2. Click "Schedule Meeting"
3. Select template, facilitator, date/time
4. Meeting created with segments instantiated

### Run a Live Meeting
1. Click "Start Meeting" on scheduled meeting
2. Facilitator sees "Next Segment" button
3. All participants see current segment + timer
4. Add headlines in real-time
5. Changes sync across all clients

### Manage Templates
1. Click "Manage Templates" on meetings page
2. Create custom agenda templates
3. Drag to reorder segments
4. Set duration per segment

## Testing Checklist
- ✅ Schedule meeting from template
- ✅ Start meeting and view as participant
- ✅ Facilitator advances segments
- ✅ Non-facilitator cannot advance
- ✅ Add headline appears for all users
- ✅ Delete own headline only
- ✅ Presence updates on join/leave
- ✅ RLS prevents cross-tenant access
- ✅ Audit logs all mutations

## Security Notes
- All tables have RLS enabled with tenant isolation
- Only meeting participants can join realtime channels
- Facilitator (Leader) role required for segment control
- Users can only modify their own content
- All mutations logged to `audit_eos_events` with user/timestamp

## Known Limitations (Phase 2)
- No segment timer countdown (static durations)
- No IDS (Identify, Discuss, Solve) workflow yet
- No meeting rating/conclusion form
- No meeting history/notes export
- No participant add/remove during meeting

## Next Steps (Phase 3+)
- IDS list management with prioritization
- Live timer with overrun warnings
- Meeting rating and conclusion notes
- Scorecard integration during meetings
- Rock review during meetings
- Meeting notes and action items export

## Troubleshooting

### No template in dropdown
- Check tenant has default template: Query `eos_agenda_templates` for your tenant_id
- Run seed migration again if needed

### "Access denied: EOS role required"
- User needs entry in `eos_user_roles` table
- Contact admin to assign EOS role

### Real-time not updating
- Check browser console for subscription errors
- Verify RLS policies allow participant access
- Check Supabase realtime logs

### "Only facilitator can advance segments"
- Check `eos_meeting_participants` for role = 'Leader'
- Only one Leader per meeting

## Links
- [Supabase Dashboard](https://supabase.com/dashboard/project/yxkgdalkbrriasiyyrwk)
- [Database Tables](https://supabase.com/dashboard/project/yxkgdalkbrriasiyyrwk/editor)
- [Realtime Logs](https://supabase.com/dashboard/project/yxkgdalkbrriasiyyrwk/logs/realtime-logs)
