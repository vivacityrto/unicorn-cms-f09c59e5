# EOS Meetings: Level 10, Quarterly & Annual

## Overview

EOS provides three types of structured meetings to maintain organizational alignment and drive progress:
- **Level 10 (L10)**: Weekly 90-minute tactical meetings
- **Quarterly**: Full-day strategic planning sessions
- **Annual**: Two-day comprehensive planning meetings

All meetings use default agendas automatically assigned based on meeting type, following standard EOS methodology.

## Meeting Types and Agendas

Default agendas are pre-configured for each meeting type and automatically selected when scheduling. Facilitators can customize segments before or during the meeting if needed.

### Level 10 Meeting (Weekly - 90 minutes)
The weekly Level 10 meeting is the heartbeat of EOS, designed to keep the team aligned and moving forward.

**Default Agenda:**
1. Segue (Good News) – 5 min
2. Scorecard Review – 5 min
3. Rock Review – 5 min
4. Headlines – 5 min
5. To-Dos Review – 5 min
6. IDS (Identify, Discuss, Solve) – 60 min
7. Conclude & Rate – 5 min

### Quarterly Meeting (Full Day - 405 minutes)
The Quarterly meeting is an intensive session designed to review past performance, set rocks for the upcoming quarter, and solve strategic issues.

**Default Agenda:**
1. Segue & Win Check-in – 15 min
2. Scorecard Review (13-week trends) – 30 min
3. Rock Review (Quarter Retrospective) – 45 min
4. Customer/Employee Headlines – 20 min
5. Issues Parking Lot – 15 min
6. V/TO Review (1-Year Plan) – 45 min
7. Set Next-Quarter Rocks – 90 min
8. Prioritize Issues & IDS – 90 min
9. Accountability Chart Updates – 30 min
10. Cascading Messages & To-Dos – 15 min
11. Conclude & Rate – 10 min

### Annual Meeting (2 Days - 810 minutes)
The Annual meeting is a comprehensive strategic planning session that reviews the past year and sets the direction for the year ahead.

**Default Agenda:**

**Day 1:**
1. Company Review – 45 min
2. Rock Year-End Retrospective – 45 min
3. Team Health / People Analyzer – 45 min
4. SWOT / Issues List – 60 min
5. Three-Year Picture Refresh – 60 min
6. One-Year Plan – 60 min

**Day 2:**
7. Accountability Chart (Future Org) – 45 min
8. Set Company Rocks – 75 min
9. Prioritize Issues & IDS – 90 min
10. Cascading Messages & To-Dos – 30 min
11. Conclude & Rate – 10 min

## Key Features

### Rock Planning
- Create 3-7 company rocks for the next period
- Assign owners and set due dates
- Tag rocks by level (company, team, individual)
- Support client tagging for multi-client scenarios

### V/TO Draft Changes
- Review current Vision/Traction Organizer™
- Propose updates to 3-Year Picture and 1-Year Plan
- Changes saved as drafts (require Admin approval to publish)
- Track proposed revenue and profit targets

### Accountability Chart Updates
- Review current organizational structure
- Propose changes to roles and responsibilities
- Draft changes for Admin review
- Ensure future structure aligns with growth plans

### SWOT Analysis
- Capture Strengths, Weaknesses, Opportunities, Threats
- Convert SWOT items to Issues for IDS discussion
- Strategic input for planning

### Rock Retrospective
- Review past quarter/year rocks
- Capture learnings and insights
- Celebrate wins and analyze misses
- Inform future planning

## Scheduling

### Creating a Meeting
1. Navigate to EOS → Meetings
2. Click "Schedule Meeting"
3. **Select meeting type** - Choose from L10, Quarterly, or Annual meeting cards
4. **Auto-selected agenda** - Default template is automatically selected for the chosen type
5. **Enter details**:
   - Meeting title
   - Facilitator (required)
   - Scheduled date & time
   - Duration (auto-filled: 90min for L10, 405min for Quarterly, 810min for Annual)
6. Click "Schedule Meeting" to create

### Default Agenda Templates
- **Automatic assignment**: Each meeting type automatically uses its default template
- **Pre-configured segments**: Agenda items with durations are populated instantly
- **No manual selection needed**: The agenda template selector has been removed for simplicity
- **Customizable**: Admins can edit default templates via "Manage Agenda Templates" if needed
- **Tenant-specific**: Each organization gets their own set of default templates

> **Note**: Templates are seeded automatically for all tenants using the `seed_default_meeting_templates()` database function.

## Live Meeting Flow

### During the Meeting
- Facilitator controls segment progression
- Real-time collaboration on drafts
- Issue tracking with category (weekly/quarterly/annual)
- Rock planning with immediate creation
- All changes audited

### Meeting Artifacts
- V/TO draft changes
- Chart draft changes
- New rocks created
- Issues identified
- To-dos assigned
- Cascading messages

## Outcomes & Summary

### End Meeting Process
1. Facilitator clicks "End Meeting"
2. System generates comprehensive summary:
   - New rocks created
   - Issues solved vs. carried forward
   - V/TO proposed changes
   - Chart proposed changes
   - To-dos and cascading messages
   - Attendance and rating

### Export Options
- PDF summary report
- CSV data export
- Email to participants

## Permissions

### Participants
- View current V/TO and Chart
- Propose draft changes
- Create issues and rocks
- Add notes and learnings

### Facilitators
- All participant permissions
- Advance meeting segments
- End meeting and generate summary

### Admins
- All facilitator permissions
- Edit agenda templates
- Publish V/TO and Chart changes
- Manage meeting settings

## Best Practices

### Preparation
1. Review previous quarter/year metrics
2. Gather rock status updates
3. Collect team feedback
4. Prepare P&L or financial reports (Annual)

### During Meeting
1. Stay on time (use segment timers)
2. Capture all ideas in Issues Parking Lot
3. Focus on future, not past blame
4. Ensure everyone participates
5. Document decisions and commitments

### Follow-up
1. Review and approve draft V/TO changes
2. Communicate cascading messages
3. Ensure rock owners understand commitments
4. Schedule next meeting
5. Track to-dos completion

## Security & Audit

- All actions logged with user, timestamp, and reason
- Tenant isolation enforced
- Client tagging respected for multi-client meetings
- Draft changes require Admin approval
- Meeting participants only see their meeting data

## Database Schema

### New Tables
- `eos_vto_drafts`: Proposed V/TO changes
- `eos_chart_drafts`: Proposed Chart changes

### Extended Tables
- `eos_issues`: Added `category` field (weekly/quarterly/annual)
- `eos_meeting_summaries`: Added `meeting_type`, `period_range`, `vto_changes`, `chart_changes`
- `eos_meetings`: Support for `meeting_type` (level_10/quarterly/annual)

### RPC Functions
- `seed_default_meeting_templates()`: Initialize default templates for all meeting types (L10, Quarterly, Annual)
- `propose_vto_change(meeting_id, draft_json)`: Save V/TO draft
- `propose_chart_change(meeting_id, draft_json)`: Save Chart draft
- `carry_forward_unresolved_issues(meeting_id, target_meeting_id)`: Copy issues to next meeting

## Troubleshooting

### Issue: Can't create rocks
- Ensure meeting type is quarterly or annual
- Verify user has participant role in meeting
- Check rock title is not empty

### Issue: Draft changes not saving
- Verify user is meeting participant
- Check meeting is not yet completed
- Ensure draft_json format is valid

### Issue: Summary not generating
- Verify meeting has segments
- Ensure facilitator role for user
- Check meeting has not already been summarized

## Future Enhancements

- Interactive Accountability Chart editor
- People Analyzer integration
- SWOT-to-Issue automation
- Advanced rock templates
- Multi-day meeting split view
