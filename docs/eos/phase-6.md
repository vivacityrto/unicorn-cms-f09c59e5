# Phase 6: Client Viewer, Notifications, Calendar & Polish

## Overview
Phase 6 adds client-facing features, notification system, calendar management, and UI polish to the EOS implementation.

## Features Implemented

### 1. Client Viewer Access

**Role:** `client_viewer` (read-only)

**Access Scope:**
- Can view only items tagged with their `client_id`
- Read-only access (no create/update/delete)
- Cannot join live meetings
- Cannot access internal V/TO or Accountability Chart

**Routes:**
- `/client/eos` - Main client overview with tabs for:
  - Rocks (90-day goals)
  - Issues (IDS outcomes)
  - Headlines (meeting highlights)
  - Meeting Summaries (completed meeting reports)

**Security:**
- RLS policies enforce client_id filtering
- All queries validate user's client_id matches requested data
- Separate policies for client_viewer role on each table

### 2. Notifications & Reminders

**Events Tracked:**
1. **Meeting Scheduled** - 24 hours before meeting
2. **Meeting Starting** - 10 minutes before meeting
3. **Rock Off-Track** - Weekly check for rocks behind schedule
4. **To-Do Overdue** - Day after due date if incomplete
5. **Metric Missing** - 1 day before meeting if scorecard entry not entered
6. **Issue Assigned** - Immediate notification when assigned

**Channels:**
- In-app notifications (bell icon in header)
- Email notifications (via Mailgun)
- Optional daily digest mode

**User Preferences:**
Users can configure via `/settings/notifications`:
- Enable/disable email notifications
- Enable/disable in-app notifications
- Enable daily digest mode
- Set quiet hours (start/end time + timezone)

**Database Tables:**
```sql
-- User notification preferences
user_notification_prefs (
  user_id, tenant_id, email_enabled, inapp_enabled,
  digest_enabled, quiet_hours
)

-- Notification queue
notification_queue (
  user_id, type, payload, scheduled_at, delivered_at,
  channel, status
)
```

### 3. Calendar & Recurrence

**Meeting Recurrence:**
- Create weekly recurring meetings from a base meeting
- Specify weeks ahead (1-52)
- Automatically copies participants and agenda segments
- Maintains parent-child relationship

**Calendar Integration:**
- Download .ics file for any meeting
- "Add to Google Calendar" link
- "Add to Outlook" link
- Calendar view at `/eos/calendar` showing upcoming meetings

**iCal Export Format:**
```
BEGIN:VCALENDAR
VERSION:2.0
...
DTSTART:20250115T100000
DTEND:20250115T113000
SUMMARY:Weekly L10 Meeting
...
END:VCALENDAR
```

### 4. UI Polish & Performance

**New Shared Components:**
- `PageHeader` - Consistent page titles with actions
- `StatCard` - Metric cards with icons and trends
- `AnimatedTabs` - Smooth tab transitions (respects prefers-reduced-motion)
- `EmptyState` - Friendly empty states with CTAs
- `LoadingSkeleton` - Loading states for tables, cards, stats

**Design Enhancements:**
- Extended spacing scale in Tailwind config
- New shadow system (card, card-hover)
- Status color tokens (success, warning, info, danger)
- Smooth transitions with cubic-bezier easing
- Consistent card padding and gaps

**Accessibility:**
- Focus rings on all interactive elements
- ARIA labels for icons and actions
- Keyboard navigation support
- Screen reader announcements for state changes

**Performance:**
- Reduced motion support in animations
- Proper loading skeletons prevent layout shift
- Memoized list rendering
- Efficient query invalidation

## RPC Functions

### get_client_eos_overview(p_client_id UUID)
Returns aggregate counts for client's rocks, issues, and headlines.

**Returns:**
```json
{
  "rocks": { "active": 3, "complete": 5 },
  "issues": { "open": 2, "solved": 8 },
  "headlines": 15
}
```

### list_meeting_summaries_for_client(p_client_id, p_limit, p_offset)
Paginated list of meeting summaries for a specific client.

**Returns:** Table with id, meeting_id, created_at, meeting_title, meeting_date, todos, issues

### set_user_notification_prefs(p_prefs JSONB)
Upsert user notification preferences.

**Params:**
```json
{
  "email_enabled": true,
  "inapp_enabled": true,
  "digest_enabled": false,
  "quiet_hours": {
    "start": "22:00",
    "end": "07:00",
    "tz": "Australia/Sydney"
  }
}
```

### create_recurring_meetings(p_base_meeting_id, p_weeks_ahead)
Creates N weekly meetings based on a template meeting.

**Returns:** Array of new meeting IDs

## Usage Examples

### Client Viewer Access
```typescript
// Automatic filtering by client_id in hooks
const { rocks } = useEosRocks(); // Only returns client's rocks
const { issues } = useEosIssues(); // Only returns client's issues
```

### Notification Preferences
```typescript
import { useNotifications } from '@/hooks/useNotifications';

const { prefs, updatePrefs } = useNotifications();

updatePrefs.mutate({
  email_enabled: true,
  quiet_hours: {
    start: '22:00',
    end: '07:00',
    tz: 'Australia/Sydney'
  }
});
```

### Calendar Integration
```typescript
// Download iCal file
handleDownloadIcal(meeting);

// Add to Google Calendar
window.open(generateGoogleCalendarUrl(meeting), '_blank');

// Create recurring meetings
createRecurring.mutate({
  p_base_meeting_id: meetingId,
  p_weeks_ahead: 12
});
```

## Security Notes

### Client Viewer RLS
- All EOS tables have separate policies for client_viewer role
- Policies check `users.client_id = table.client_id`
- Read-only access enforced at database level
- No access to internal tools (V/TO, Chart, live meetings)

### Notification Access
- Users can only view/manage their own notifications
- System functions require super_admin role to insert notifications
- Quiet hours respected by delivery functions

### Calendar Access
- Meeting data filtered by tenant and participant
- iCal exports don't expose sensitive data
- Recurring meetings maintain same permissions as base meeting

## Testing Checklist

- [ ] Client viewer can only see their tagged rocks/issues/headlines
- [ ] Client viewer cannot edit or delete any records
- [ ] Client viewer cannot access V/TO or Accountability Chart
- [ ] Client viewer cannot join live meetings
- [ ] Notification preferences save correctly
- [ ] Quiet hours prevent notifications during specified times
- [ ] Email notifications send successfully
- [ ] In-app notifications appear in bell dropdown
- [ ] iCal file downloads correctly and opens in calendar apps
- [ ] Google Calendar link works
- [ ] Outlook link works
- [ ] Recurring meetings create correct dates and copy participants
- [ ] Weekly recurrence maintains agenda template
- [ ] Loading skeletons appear before data loads
- [ ] Empty states show helpful messages and CTAs
- [ ] Animations respect prefers-reduced-motion
- [ ] Focus rings visible on keyboard navigation
- [ ] Screen readers announce state changes

## Future Enhancements (Phase 7+)

- Slack/Teams integration for notifications
- Calendar view with month/week grid layout
- Notification digest scheduling and batching
- Webhook integrations for external calendar systems
- Advanced recurrence patterns (bi-weekly, monthly)
- Notification history and archive
- Mobile push notifications

## Rollback Instructions

To rollback Phase 6 changes:

```sql
-- Drop new tables
DROP TABLE IF EXISTS public.user_notification_prefs CASCADE;
DROP TABLE IF EXISTS public.notification_queue CASCADE;

-- Remove new columns
ALTER TABLE public.eos_meetings 
  DROP COLUMN IF EXISTS recurrence_rule,
  DROP COLUMN IF EXISTS recurrence_end_date,
  DROP COLUMN IF EXISTS parent_meeting_id;

ALTER TABLE public.users 
  DROP COLUMN IF EXISTS client_id;

-- Drop new functions
DROP FUNCTION IF EXISTS public.get_client_eos_overview(UUID);
DROP FUNCTION IF EXISTS public.list_meeting_summaries_for_client(UUID, INT, INT);
DROP FUNCTION IF EXISTS public.set_user_notification_prefs(JSONB);
DROP FUNCTION IF EXISTS public.create_recurring_meetings(UUID, INT);

-- Remove client_viewer from enum (requires recreating enum)
-- Manual intervention required if other data exists
```

## Support

For issues or questions about Phase 6 features:
- Email: support@vivacity.com.au
- Phone: 1300 729 455
- Documentation: See Phase 1-5 docs for foundation features
