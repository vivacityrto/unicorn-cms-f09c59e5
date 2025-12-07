# EOS Phase 3: Scorecard, V/TO, and Enhanced Rocks

## Overview
Phase 3 adds advanced EOS tracking capabilities including the Scorecard system for weekly metrics, the Vision/Traction Organizer (V/TO) for strategic planning, and enhanced Rocks functionality with quarterly tracking and client-specific goals.

## Components Implemented

### 1. Scorecard System

#### Database Tables
- **eos_scorecard**: Container for weekly scorecard tracking
- **eos_scorecard_metrics**: Defines measurable KPIs
- **eos_scorecard_entries**: Weekly data points for each metric

#### Features
- Weekly metric tracking with goal targets
- Multiple measurement units (number, percentage, currency, hours)
- Automated week-over-week comparisons
- Visual trend indicators (up/down/neutral)
- Customizable display order
- Team member accountability assignment

#### Components
- `EosScorecard` page for managing scorecards
- `ScorecardGrid` for interactive data entry
- `MetricEditorDialog` for metric configuration

### 2. Vision/Traction Organizer (V/TO)

#### Database Table
- **eos_vto**: Complete V/TO with version control

#### Features
- Core Values definition
- Core Focus (company niche)
- 10-Year Target vision
- Marketing Strategy (target market, value prop, proven process)
- 3-Year Picture
- 1-Year Plan
- Quarterly Rocks linkage
- Issues List integration
- Version history with archiving

#### Components
- `EosVto` page with view/edit modes
- `VtoEditor` for creating and updating V/TO
- `VtoViewer` for reading published V/TO
- Version history with rollback capability

### 3. Enhanced Rocks Module

#### Enhanced Features
- **Levels**: Company, department, and individual rocks
- **Quarterly Tracking**: Start/end dates for 90-day cycles
- **Client-Specific**: Associate rocks with specific clients
- **Progress Tracking**: Completion percentage and status
- **Priority System**: Rank rocks by importance
- **Drop to Issue**: Convert incomplete rocks to issues

#### Database Enhancements
- Added `level` field (company/department/individual)
- Added `quarter_start` and `quarter_end` dates
- Added `status` enum (not_started/on_track/at_risk/off_track/complete)
- Added `completion_percentage` (0-100)
- Added `priority` field
- Added `client_id` for client-specific rocks

#### Components
- Enhanced `EosRocks` page with filtering by level
- `RockFormDialog` for creating and editing rocks
- Visual progress indicators
- Quarter-based grouping

## Real-time Capabilities

All new tables are configured for Supabase Realtime with:
- REPLICA IDENTITY FULL for complete row data
- supabase_realtime publication membership
- Real-time updates in LiveMeetingView for scorecard and rocks

## Integration with Level 10 Meetings

### Scorecard Segment
When the current meeting segment contains "scorecard":
- Displays top 5 active metrics
- Shows goal targets
- Quick view of metric performance

### Rock Review Segment
When the current meeting segment contains "rock":
- Lists active rocks (not completed)
- Shows progress bars for each rock
- Displays status badges
- Shows due dates

## Security & Access Control

### RLS Policies
All Phase 3 tables enforce:
- Tenant isolation (users only see their organization's data)
- Role-based access via `eos_user_roles`
- Admin-only write access to scorecards
- Facilitator permissions for meeting management

### Helper Functions
- `has_eos_role()`: Check specific EOS role
- `has_any_eos_role()`: Verify any EOS access
- `is_eos_admin()`: Admin-level checks
- `can_facilitate_eos()`: Facilitator verification

### RPC Functions
- `publish_vto()`: Create new V/TO version with audit trail
- `drop_rock_to_issue()`: Convert rock to issue with context

## Usage Patterns

### Creating a Scorecard
1. Navigate to /eos/scorecard
2. Click "Add Metric"
3. Define metric name, unit, goal, owner
4. Set display order
5. Enter weekly data via the grid

### Publishing a V/TO
1. Navigate to /eos/vto
2. Click "Create Your First V/TO" or "Edit V/TO"
3. Fill in all sections
4. Click "Publish V/TO" to create new version
5. Previous versions are archived automatically

### Managing Enhanced Rocks
1. Navigate to /eos/rocks
2. Filter by level (Company/Department/Individual)
3. Click "Create Rock" to open dialog
4. Set level, quarter dates, priority
5. Optionally link to client
6. Track progress with completion percentage
7. Use "Drop to Issue" if rock can't be completed

### Live Meeting Integration
During a Level 10 meeting:
1. Start meeting from /eos/meetings
2. Scorecard segment automatically shows relevant metrics
3. Rock Review segment displays active rocks
4. Headlines can be added throughout
5. Facilitator advances segments via "Next Segment"

## Data Flow

```
V/TO (Vision)
  ↓
3-Year Picture
  ↓
1-Year Plan
  ↓
Quarterly Rocks (90-Day Goals)
  ↓
Weekly Scorecard Metrics
  ↓
Level 10 Meetings (Track Progress)
  ↓
Issues List (Solve Problems)
```

## Future Enhancements
- Scorecard analytics and trends
- V/TO comparison between versions
- Rock dependencies and relationships
- Automated rock status updates based on completion
- Integration with accountability chart
- Meeting notes and action items linked to rocks
- Client portal access to their rocks

## Technical Notes

### Type Definitions
All Phase 3 types are defined in `src/types/eos.ts`:
- `EosScorecardMetric`
- `EosScorecardEntry`
- `EosRock` (enhanced)
- `EosVtoVersion`

### Custom Hooks
- `useEosScorecard()`: Scorecard CRUD operations
- `useEosScorecardMetrics()`: Metric management
- Enhanced `useEosRocks()`: Rocks with new fields

### Database Functions
All Phase 3 RPC functions use `SECURITY DEFINER` and proper tenant/role checks to prevent privilege escalation.

## Testing Checklist
- [ ] Create a scorecard with multiple metrics
- [ ] Record weekly data for 4+ weeks
- [ ] Create a V/TO with all sections filled
- [ ] Publish new V/TO version
- [ ] View version history
- [ ] Create company-level rock
- [ ] Create department-level rock
- [ ] Create individual rock with client link
- [ ] Update rock progress percentage
- [ ] Drop incomplete rock to issue
- [ ] Start Level 10 meeting
- [ ] Verify scorecard appears in Scorecard segment
- [ ] Verify rocks appear in Rock Review segment
- [ ] Test real-time updates with multiple users

## Migration Notes
Phase 3 migration includes:
- CREATE TABLE IF NOT EXISTS for new tables
- ALTER TABLE with conditional column additions for existing tables
- Trigger removal and recreation to avoid conflicts
- RLS policy creation with proper role checks
- Realtime configuration for all new tables

All changes are backwards compatible with Phase 1 and Phase 2.
