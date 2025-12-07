# EOS Recurring Meetings

## Overview

The Unicorn 2.0 platform supports full recurring meeting schedules aligned with the EOS (Entrepreneurial Operating System) rhythm:

- **Level 10 (L10)**: Weekly recurring meetings (e.g., every Monday at 10:30 AM)
- **Quarterly**: Last Monday of each quarter (March, June, September)
- **Annual**: Last Monday in December (replaces Q4 quarterly meeting)

All recurrences automatically generate meeting instances, sync to calendar, and handle conflicts (Annual replaces Q4 automatically).

## Creating Recurring Meetings

### Step 1: Schedule Base Meeting

1. Navigate to EOS → Meetings
2. Click "Schedule Meeting"
3. Select meeting type (Level 10, Quarterly, or Annual)
4. Enter meeting details:
   - Title
   - First meeting date and time
   - Facilitator
   - Duration

### Step 2: Configure Recurrence

The frequency is automatically suggested based on meeting type:
- **Level 10** → Weekly
- **Quarterly** → Quarterly
- **Annual** → Annual

You can override this to create one-time meetings if needed.

### Frequency Options

- **One-time**: Single meeting (no recurrence)
- **Weekly (Level 10)**: Every Monday at the specified time
- **Quarterly**: Last Monday of March, June, and September
- **Annual**: Last Monday of December

### End Rule

- **No end date**: Meetings continue indefinitely (up to next 12 weeks/4 quarters/1 year are generated)
- **End by date**: Recurrence stops after specified date

## Recurrence Patterns

### Weekly (Level 10)

- **Pattern**: Every Monday at the specified time
- **RRULE**: `FREQ=WEEKLY;BYDAY=MO;INTERVAL=1`
- **Generation**: Next 12 weeks are created automatically
- **Example**: Monday 10:30 AM weekly meetings

### Quarterly

- **Pattern**: Last Monday of March, June, and September
- **RRULE**: `FREQ=YEARLY;BYMONTH=3,6,9;BYDAY=-1MO`
- **Generation**: Next 4 quarters are created
- **Q4 Exception**: Quarter 4 (December) is skipped if an Annual meeting exists
- **Example**: 
  - Q1: Last Monday of March
  - Q2: Last Monday of June
  - Q3: Last Monday of September
  - Q4: Skipped (Annual meeting)

### Annual

- **Pattern**: Last Monday of December
- **RRULE**: `FREQ=YEARLY;BYMONTH=12;BYDAY=-1MO`
- **Generation**: Next year's meeting is created
- **Replaces**: Q4 quarterly meeting automatically
- **Example**: Last Monday of December each year

## Managing Recurring Series

### Viewing Occurrences

On any meeting page with a recurring series:
1. Look for the "Recurring Series" card
2. Click "View All Occurrences" to expand
3. See all scheduled meetings with their status

### Cancelling Single Occurrence

To cancel one meeting in the series:
1. Find the occurrence in the list
2. Click the X button next to the occurrence
3. Confirm cancellation
4. The rest of the series remains scheduled

### Cancelling All Future Meetings

To cancel all future occurrences:
1. In the Recurring Series card, click "Cancel All Future"
2. Confirm the action
3. All future meetings will be marked as cancelled
4. Past meetings remain unchanged

### Status Indicators

- **Scheduled**: Meeting is upcoming and active
- **Cancelled**: Meeting was cancelled
- **Completed**: Meeting has finished

## Calendar Integration

All recurring meetings are:
- Visible in the EOS calendar view
- Color-coded by type:
  - 🟣 Level 10 (purple)
  - 🟠 Quarterly (orange)
  - 🔵 Annual (blue)
- Synced to ICS feed for external calendars
- Include "Recurring Series" badge

## Notifications

Participants receive notifications:
- 24 hours before each meeting
- 10 minutes before each meeting
- Weekly digest of upcoming EOS meetings

## Database Schema

### eos_meeting_recurrences

Stores the recurrence pattern:
- `meeting_id`: Base meeting reference
- `recurrence_type`: weekly, quarterly, or annual
- `rrule`: iCal RRULE syntax
- `start_date`: First occurrence
- `until_date`: Optional end date
- `timezone`: Default Australia/Sydney

### eos_meeting_occurrences

Stores generated meeting instances:
- `recurrence_id`: Parent recurrence
- `meeting_id`: Linked actual meeting (when created)
- `starts_at`: Occurrence start time
- `ends_at`: Occurrence end time
- `status`: scheduled, cancelled, or completed
- `is_generated`: Auto-generated flag

## Permissions

- **View Recurrences**: Any user with EOS role access
- **Create Recurrences**: Facilitators and Admins
- **Cancel Occurrences**: Facilitators and Admins
- **Cancel Series**: Facilitators and Admins

## Best Practices

1. **Consistency**: Keep meeting times consistent for team familiarity
2. **Advance Notice**: Schedule recurrences at least 2 weeks in advance
3. **Review Quarterly**: Review recurring patterns during quarterly planning
4. **Cancel Early**: Cancel occurrences as soon as you know they won't happen
5. **Annual Planning**: Plan Annual meetings 6-8 weeks in advance

## Technical Details

### RRULE Syntax

The system uses iCal RRULE syntax:
- `FREQ=WEEKLY`: Weekly recurrence
- `BYDAY=MO`: On Mondays
- `BYMONTH=3,6,9`: In March, June, September
- `BYDAY=-1MO`: Last Monday of month
- `UNTIL=20251231`: End date

### Generation Logic

Meetings are generated:
- **Weekly**: Next 12 weeks
- **Quarterly**: Next 4 quarters (skip Q4 if Annual exists)
- **Annual**: Next 1 year

Regeneration is idempotent - running again won't duplicate meetings.

### Timezone Handling

All times are stored in UTC, displayed in Australia/Sydney timezone by default. Users can configure their timezone preference.

## Troubleshooting

### Q: Why don't I see Q4 quarterly meetings?

A: If an Annual meeting is scheduled for December, Q4 quarterly meetings are automatically skipped to avoid duplication.

### Q: Can I edit a recurring series?

A: Currently, you need to cancel the existing series and create a new one. Future updates will support series editing.

### Q: What happens to past meetings when I cancel a series?

A: Only future meetings are cancelled. Past and completed meetings remain in the system for historical purposes.

### Q: How do I convert a one-time meeting to recurring?

A: Schedule a new recurring series starting from the next occurrence. The original one-time meeting remains separate.
