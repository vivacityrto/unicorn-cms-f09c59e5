# EOS Phase 4: Issues (IDS) & Meeting Summary

## Overview
Phase 4 implements the EOS Issues/IDS (Identify-Discuss-Solve) workflow within live meetings, deepens To-Do integration, and generates comprehensive meeting summaries.

## Database Schema

### eos_issues (Enhanced)
New fields added:
- `priority` (text): 'high' | 'medium' | 'low'
- `raised_by` (uuid): User who raised the issue
- `linked_rock_id` (uuid): Optional link to a rock
- `solved_at` (timestamptz): When issue was solved
- `solution` (text): Solution notes

### eos_todos (Enhanced)
New fields added:
- `owner_id` (uuid): Task owner
- `due_date` (date): Task deadline
- `completed_at` (timestamptz): Completion timestamp

### eos_meeting_summaries (New)
Stores comprehensive meeting summaries:
- `meeting_id` (uuid): Unique link to meeting
- `rating` (integer): Meeting rating 1-10
- `attendance` (jsonb): Participant attendance data
- `todos` (jsonb): Snapshot of created to-dos
- `issues` (jsonb): Snapshot of discussed issues
- `rocks` (jsonb): Snapshot of rock reviews
- `headlines` (jsonb): Meeting headlines
- `cascades` (jsonb): Cascade messages
- `emailed_at` (timestamptz): When summary was emailed

## RPC Functions

### create_issue()
Creates an issue from various sources.

**Parameters:**
- `p_tenant_id` (bigint)
- `p_source` (text): 'scorecard' | 'rock' | 'headline' | 'ad_hoc'
- `p_title` (text)
- `p_description` (text, optional)
- `p_priority` (text, default: 'medium')
- `p_client_id` (uuid, optional)
- `p_linked_rock_id` (uuid, optional)
- `p_meeting_id` (uuid, optional)

**Returns:** UUID of created issue

**Permissions:** Requires EOS role access

### set_issue_status()
Changes issue status (facilitator/admin only).

**Parameters:**
- `p_issue_id` (uuid)
- `p_status` (text)
- `p_solution_text` (text, optional)

**Returns:** void

**Permissions:** Facilitator or Admin only

**Note:** When status is 'Solved', automatically sets `solved_at` and `solution`

### create_todos_from_issue()
Bulk creates to-dos from an issue solution.

**Parameters:**
- `p_issue_id` (uuid)
- `p_todos` (jsonb): Array of todo objects with title, owner_id, due_date

**Returns:** Array of created todo UUIDs

**Permissions:** Facilitator, Admin, or meeting participant

### generate_meeting_summary()
Generates comprehensive meeting summary (idempotent).

**Parameters:**
- `p_meeting_id` (uuid)

**Returns:** UUID of summary

**Permissions:** Facilitator only

**Behavior:**
- Aggregates todos, issues, headlines, and participants
- Marks meeting as complete
- Creates audit log entry
- Returns existing summary if already generated

## UI Components

### IssuesQueue
Displays prioritized list of meeting issues.

**Features:**
- Drag-and-drop reordering (facilitator only)
- Filter by client
- Priority badges (high/medium/low)
- Client badges
- Click to open IDS dialog

**Props:**
- `issues`: Array of EosIssue
- `onSelectIssue`: Callback when issue selected
- `onCreateIssue`: Callback to create new issue
- `isFacilitator`: Boolean for permission checks

### IDSDialog
Three-tab dialog for the IDS process.

**Tabs:**
1. **Identify**: View issue details, start discussion
2. **Discuss**: Add discussion notes (facilitator)
3. **Solve**: Record solution, create to-dos

**Features:**
- Status transitions (open → discussing → solved)
- Solution text capture
- Inline to-do creation from solution
- Owner assignment with user lookup
- Due date picker
- Bulk to-do creation

**Props:**
- `open`: Boolean dialog state
- `onOpenChange`: State setter
- `issue`: Current issue or null
- `isFacilitator`: Permission boolean

### TodoInlineForm
Quick to-do creation form within meetings.

**Features:**
- Title input
- Owner selection dropdown
- Due date picker
- Real-time validation
- Instant creation

**Props:**
- `meetingId`: Current meeting UUID
- `onTodoCreated`: Async callback with todo data

### MeetingSummaryCard
Displays comprehensive meeting summary.

**Sections:**
- Meeting rating and date
- To-dos (with owner, due date, status)
- Solved issues (with solutions)
- Unsolved issues (carry forward)
- Headlines (good news vs FYI)
- Cascade messages

**Props:**
- `summary`: EosMeetingSummary object

### CreateIssueDialog
Dialog for creating issues from any source.

**Features:**
- Title and description inputs
- Priority selection
- Client assignment
- Source tracking (scorecard/rock/headline/ad_hoc)
- Optional rock linkage

## Live Meeting Integration

### Enhanced LiveMeetingView
New features added:
- **Right sidebar**: Permanent issues queue visible during entire meeting
- **IDS segment**: Full IDS workflow when segment active
- **To-Dos segment**: Inline to-do creation and status management
- **End Meeting button**: Generates summary and redirects

### Layout Structure
```
[Agenda Sidebar] [Main Content Area] [Issues Queue Sidebar]
     (left)           (center)              (right)
```

### Segment-Specific Content

**Scorecard Segment:**
- Top 3 metrics with 13-period view
- Quick entry recording
- "Add to Issues" for off-track metrics

**Rock Review Segment:**
- Active rocks list
- Status quick-update
- "Drop to Issue" action

**IDS Segment:**
- Issues queue front and center
- IDS dialog for selected issues
- Real-time status updates

**To-Dos Segment:**
- All meeting to-dos listed
- TodoInlineForm for quick creation
- Status toggle

## Meeting Summary Page

### Route
`/eos/meetings/:meetingId/summary`

### Features
- Full summary display using MeetingSummaryCard
- Email summary button (stub for Phase 6)
- Back to meetings navigation
- Meeting title and date header

### Access Control
Only meeting participants can view summaries.

## Workflow Examples

### Creating Issue from Off-Track Metric
1. In Scorecard segment, metric shows red (below target)
2. Click "Add to Issues" button
3. CreateIssueDialog opens with pre-filled title and description
4. Issue appears in queue with 'scorecard' source

### Running IDS on an Issue
1. Click issue card in queue
2. IDSDialog opens on "Identify" tab
3. Facilitator clicks "Start Discussing"
4. Status changes to 'discussing', moves to "Discuss" tab
5. Facilitator adds discussion notes
6. Click "Move to Solve"
7. Facilitator enters solution text
8. Creates to-dos with owners and due dates
9. Click "Mark as Solved"
10. Issue status → 'Solved', todos created, audit logged

### Ending a Meeting
1. Facilitator clicks "End Meeting" button
2. System calls `generate_meeting_summary()` RPC
3. Summary persisted to `eos_meeting_summaries`
4. Meeting marked as complete
5. Redirect to `/eos/meetings/:id/summary`
6. Summary card displayed with all sections
7. Optional "Email Summary" button (stub)

## Real-Time Events

Meeting participants receive real-time updates via Supabase Realtime:

- `issue.created`: New issue added to queue
- `issue.updated`: Issue details changed
- `issue.status_changed`: Status transition
- `todo.created`: New to-do added
- `todo.updated`: To-do status/details changed
- `summary.generated`: Meeting ended

## Security & Permissions

### Issue Creation
- Any EOS role can create issues
- Linked rocks must belong to same tenant
- Client assignment validated

### Status Changes
- Only facilitator (Leader role) or Admin can change issue status
- Participants can propose issues but not advance them
- Solution text required when marking as 'Solved'

### To-Do Creation
- Facilitator and Members can create to-dos
- Owner must be valid user in tenant
- Due date validated

### Summary Generation
- Only facilitator can generate summary
- Function is idempotent (safe to call multiple times)
- Participants can view their meeting summaries
- SuperAdmins can view all summaries

## Audit Logging

All mutations captured in `audit_eos_events`:
- Issue creation with source
- Status changes with new status
- To-do creation from issues
- Summary generation

## Testing Checklist

✅ Create issue from scorecard off-track metric  
✅ Create issue from off-track rock  
✅ Add issue ad-hoc during IDS segment  
✅ Run full IDS workflow: identify → discuss → solve  
✅ Create multiple to-dos from solution  
✅ Filter issues by client  
✅ Non-facilitator cannot change issue status  
✅ Generate summary at meeting end  
✅ Summary displays correct counts and data  
✅ Tenant isolation enforced  
✅ Audit events logged for all actions  

## Future Enhancements (Phase 6)

- Email meeting summary via Mailgun
- Push notifications for assigned to-dos
- Sync EOS to-dos with Unicorn Tasks
- Issue escalation workflow
- Historical trends for recurring issues
- Meeting templates with pre-populated issues

## Troubleshooting

**Issue not appearing in queue:**
- Check that `meeting_id` is set correctly
- Verify RLS policies allow read access
- Confirm issue status is not 'archived'

**Cannot change issue status:**
- Verify user has facilitator role (Leader) in meeting
- Check that meeting is still active (not completed)
- Review audit logs for permission errors

**To-dos not created from solution:**
- Ensure all required fields present (title, owner_id, due_date)
- Check `create_todos_from_issue` RPC logs
- Verify tenant_id matches issue tenant_id

**Summary generation fails:**
- Confirm user has Leader role in meeting
- Check that meeting exists and is not already complete
- Review RPC function logs for specific errors
