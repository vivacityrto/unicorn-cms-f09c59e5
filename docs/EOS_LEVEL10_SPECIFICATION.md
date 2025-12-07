# EOS Level 10 Meeting Module - Technical Specification
**VivacityCMS / Unicorn 2.0**  
**Version:** 1.0  
**Date:** 2025-10-08

---

## 1. Executive Summary

### 1.1 Purpose
Implement a comprehensive EOS (Entrepreneurial Operating System) Level 10 Meeting framework within Unicorn 2.0, enabling organizations to conduct structured weekly meetings, track quarterly Rocks, maintain accountability charts, monitor scorecards, and manage issues through the IDS (Identify, Discuss, Solve) process.

### 1.2 Core Modules
1. **Vision/Traction Organizer (V/TO)** - Strategic planning document
2. **Accountability Chart** - Organizational structure and roles
3. **Scorecard** - Weekly metrics tracking
4. **Rocks** - Quarterly priorities (company/team/client-tagged)
5. **Level 10 Meetings** - Weekly synchronized meetings
6. **Issues List** - Problem tracking with client tagging
7. **To-Dos** - Action item management

### 1.3 Technology Stack
- **Frontend:** React + TypeScript
- **Backend:** Supabase (PostgreSQL + Edge Functions)
- **Real-time:** Supabase Realtime subscriptions
- **Storage:** Supabase Storage (document versioning)
- **Auth:** Existing Unicorn auth system with role extensions

---

## 2. Architecture Overview

### 2.1 System Design Principles
```
┌─────────────────────────────────────────────────────────────┐
│                    EOS Level 10 Module                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   V/TO       │  │ Accountability│  │  Scorecard   │      │
│  │   (Vision)   │  │    Chart      │  │  (Metrics)   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │               │
│         └──────────────────┼──────────────────┘               │
│                            │                                  │
│         ┌──────────────────▼──────────────────┐              │
│         │     Level 10 Meeting Engine         │              │
│         │  (Real-time sync, agenda control)   │              │
│         └──────────────────┬──────────────────┘              │
│                            │                                  │
│  ┌──────────────┐  ┌──────┴───────┐  ┌──────────────┐      │
│  │    Rocks     │  │    Issues    │  │   To-Dos     │      │
│  │  (Quarterly) │  │     (IDS)    │  │   (Action)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
         │                                          │
         ▼                                          ▼
┌─────────────────┐                      ┌─────────────────┐
│  Client Tagging │                      │  Notifications  │
│    & Filtering  │                      │   & Reminders   │
└─────────────────┘                      └─────────────────┘
```

### 2.2 Data Flow
1. **Meeting Creation** → Agenda generated from active Rocks, Scorecard, Issues
2. **Live Meeting** → Real-time updates via Supabase channels
3. **Meeting Conclusion** → Archive snapshot, generate To-Dos, update statuses
4. **Client Integration** → Issues/Rocks tagged with client_id, filterable reports

---

## 3. Database Schema

### 3.1 Core Tables

#### `eos_roles` (Enum)
```sql
CREATE TYPE eos_role AS ENUM (
  'admin',         -- Full access, manage V/TO, accountability chart
  'facilitator',   -- Lead meetings, control agenda
  'scribe',        -- Document meeting notes
  'participant',   -- Active contributor
  'client_viewer'  -- Read-only, client-specific data
);
```

#### `eos_user_roles`
```sql
CREATE TABLE eos_user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid UUID REFERENCES users(user_uuid) ON DELETE CASCADE,
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
  role eos_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_uuid, tenant_id)
);
```

#### `eos_vto_versions`
```sql
CREATE TABLE eos_vto_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  created_by UUID REFERENCES users(user_uuid),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- V/TO Sections
  core_values JSONB,              -- Array of strings
  core_focus TEXT,
  ten_year_target TEXT,
  marketing_strategy JSONB,       -- {target, message, channels}
  three_year_picture TEXT,
  one_year_plan JSONB,            -- Array of goals
  quarterly_rocks JSONB,          -- Deprecated, use eos_rocks table
  issues_list JSONB,              -- Deprecated, use eos_issues table
  
  is_active BOOLEAN DEFAULT false,
  archived_at TIMESTAMPTZ,
  UNIQUE(tenant_id, version_number)
);
```

#### `eos_accountability_chart`
```sql
CREATE TABLE eos_accountability_chart (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
  vto_version_id UUID REFERENCES eos_vto_versions(id),
  version_number INTEGER NOT NULL,
  created_by UUID REFERENCES users(user_uuid),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  chart_data JSONB NOT NULL,      -- Hierarchical structure
  is_active BOOLEAN DEFAULT false,
  archived_at TIMESTAMPTZ,
  UNIQUE(tenant_id, version_number)
);

-- chart_data structure:
-- {
--   "roles": [
--     {
--       "id": "uuid",
--       "title": "Integrator",
--       "responsibilities": ["R1", "R2", "R3", "R4", "R5"],
--       "assigned_to": "user_uuid",
--       "parent_role_id": null,
--       "level": 0
--     }
--   ]
-- }
```

#### `eos_scorecard_metrics`
```sql
CREATE TABLE eos_scorecard_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  metric_owner UUID REFERENCES users(user_uuid),
  goal_value NUMERIC,
  unit TEXT,                      -- e.g., "$", "%", "count"
  frequency TEXT DEFAULT 'weekly', -- weekly, biweekly, monthly
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `eos_scorecard_entries`
```sql
CREATE TABLE eos_scorecard_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id UUID REFERENCES eos_scorecard_metrics(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL,
  actual_value NUMERIC NOT NULL,
  notes TEXT,
  entered_by UUID REFERENCES users(user_uuid),
  entered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(metric_id, week_start_date)
);
```

#### `eos_rocks`
```sql
CREATE TABLE eos_rocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients_legacy(id),  -- NULL for company/team rocks
  
  title TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES users(user_uuid),
  
  rock_type TEXT NOT NULL,        -- 'company', 'team', 'client'
  quarter_start DATE NOT NULL,
  quarter_end DATE NOT NULL,
  
  status TEXT DEFAULT 'on_track', -- 'on_track', 'off_track', 'complete'
  completion_percentage INTEGER DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  
  created_by UUID REFERENCES users(user_uuid),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

#### `eos_issues`
```sql
CREATE TABLE eos_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients_legacy(id),  -- NULL for internal issues
  
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users(user_uuid),
  
  priority INTEGER DEFAULT 1,     -- 1 (highest) to 5 (lowest)
  status TEXT DEFAULT 'open',     -- 'open', 'discussing', 'solved', 'archived'
  
  identified_at TIMESTAMPTZ DEFAULT NOW(),
  discussed_at TIMESTAMPTZ,
  solved_at TIMESTAMPTZ,
  
  solution TEXT,
  assigned_to UUID REFERENCES users(user_uuid),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `eos_meetings`
```sql
CREATE TABLE eos_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
  
  meeting_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  
  facilitator_id UUID REFERENCES users(user_uuid),
  scribe_id UUID REFERENCES users(user_uuid),
  
  status TEXT DEFAULT 'scheduled', -- 'scheduled', 'in_progress', 'completed', 'cancelled'
  
  started_at TIMESTAMPTZ,
  concluded_at TIMESTAMPTZ,
  
  agenda JSONB,                   -- Generated agenda structure
  notes TEXT,
  
  created_by UUID REFERENCES users(user_uuid),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `eos_meeting_participants`
```sql
CREATE TABLE eos_meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES eos_meetings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(user_uuid) ON DELETE CASCADE,
  
  attendance_status TEXT DEFAULT 'invited', -- 'invited', 'present', 'absent'
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  
  UNIQUE(meeting_id, user_id)
);
```

#### `eos_meeting_segments`
```sql
CREATE TABLE eos_meeting_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES eos_meetings(id) ON DELETE CASCADE,
  
  segment_type TEXT NOT NULL,     -- 'segue', 'scorecard', 'rocks', 'headlines', 'todos', 'ids', 'conclude'
  segment_order INTEGER NOT NULL,
  
  allocated_minutes INTEGER,      -- Standard: segue(5), scorecard(5), rocks(5), headlines(5), todos(5), ids(60), conclude(5)
  actual_start_time TIMESTAMPTZ,
  actual_end_time TIMESTAMPTZ,
  
  content JSONB,                  -- Segment-specific data
  notes TEXT,
  
  UNIQUE(meeting_id, segment_order)
);
```

#### `eos_todos`
```sql
CREATE TABLE eos_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
  meeting_id UUID REFERENCES eos_meetings(id),  -- NULL if not from meeting
  
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES users(user_uuid),
  due_date DATE,
  
  status TEXT DEFAULT 'open',     -- 'open', 'in_progress', 'complete', 'deferred'
  priority INTEGER DEFAULT 3,
  
  created_by UUID REFERENCES users(user_uuid),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

### 3.2 Indexes
```sql
-- Performance indexes
CREATE INDEX idx_eos_rocks_tenant_quarter ON eos_rocks(tenant_id, quarter_start);
CREATE INDEX idx_eos_rocks_client ON eos_rocks(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_eos_issues_tenant_status ON eos_issues(tenant_id, status);
CREATE INDEX idx_eos_issues_client ON eos_issues(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_eos_meetings_tenant_date ON eos_meetings(tenant_id, meeting_date DESC);
CREATE INDEX idx_eos_scorecard_entries_week ON eos_scorecard_entries(week_start_date DESC);
```

---

## 4. Feature Specifications

### 4.1 Vision/Traction Organizer (V/TO)

#### 4.1.1 Overview
The V/TO is the foundational strategic document covering 8 key components:
1. Core Values (3-7 values)
2. Core Focus (purpose/niche)
3. 10-Year Target (BHAG)
4. Marketing Strategy (target/message/channels)
5. 3-Year Picture
6. 1-Year Plan (3-7 goals)
7. Quarterly Rocks (integrated with eos_rocks)
8. Issues List (integrated with eos_issues)

#### 4.1.2 Functionality
- **Version Control**: Create new version on significant changes
- **Active Version**: Only one active version per tenant at a time
- **Archive**: Previous versions stored with created_at timestamp
- **Permissions**: Admin and Facilitator can edit, all can view
- **UI**: Multi-step form with section-by-section editing

#### 4.1.3 API Endpoints
```typescript
// Edge function: eos-vto
POST   /eos-vto/create           // Create new version
GET    /eos-vto/active            // Get active version
GET    /eos-vto/history           // Get version history
PUT    /eos-vto/:id/update        // Update specific section
POST   /eos-vto/:id/activate      // Set as active version
POST   /eos-vto/:id/archive       // Archive version
```

### 4.2 Accountability Chart

#### 4.2.1 Overview
Visual org chart showing:
- Roles with 5 key responsibilities each
- Person assigned to each role (seat)
- Hierarchical reporting structure
- Right person in right seat indicators

#### 4.2.2 Functionality
- **Drag-and-drop interface** for chart editing
- **Version control** tied to V/TO versions
- **Responsibility templates** for common roles
- **Seat assignment** from user list
- **Right person indicator**: Green (right), Yellow (okay), Red (wrong)

#### 4.2.3 Data Structure
```typescript
interface AccountabilityRole {
  id: string;
  title: string;
  responsibilities: string[5]; // Exactly 5
  assigned_to: string | null;  // user_uuid
  parent_role_id: string | null;
  level: number;
  fit_indicator: 'green' | 'yellow' | 'red';
}
```

### 4.3 Scorecard

#### 4.3.1 Overview
Weekly metrics dashboard with 5-15 measurables tracking organizational health.

#### 4.3.2 Functionality
- **Metric Creation**: Name, owner, goal, unit, frequency
- **Weekly Entry**: Input actual values each week
- **Visual Trends**: 13-week rolling chart per metric
- **Red/Green Status**: Auto-calculated based on goal achievement
- **Meeting Integration**: Reviewed during Scorecard segment

#### 4.3.3 Calculations
```typescript
// Red/Green logic
const isGreen = (actual: number, goal: number, unit: string) => {
  if (unit === '%' || unit === 'count') {
    return actual >= goal;
  }
  if (unit === '$') {
    return actual >= goal * 0.9; // 10% tolerance
  }
  return actual >= goal;
};
```

#### 4.3.4 UI Components
- `ScorecardGrid`: Tabular view of all metrics
- `MetricTrendChart`: Line chart with 13-week history
- `MetricQuickEntry`: Modal for batch weekly entry

### 4.4 Rocks

#### 4.4.1 Overview
Quarterly priorities (90-day goals) at three levels:
1. **Company Rocks**: Organization-wide priorities (3-7)
2. **Team Rocks**: Department/team specific (3-7 per team)
3. **Client Rocks**: Client-deliverable objectives (tagged with client_id)

#### 4.4.2 Functionality
- **Quarterly Cycles**: Q1 (Jan-Mar), Q2 (Apr-Jun), Q3 (Jul-Sep), Q4 (Oct-Dec)
- **Status Tracking**: On track, Off track, Complete
- **Progress %**: 0-100% completion
- **Owner Assignment**: Single owner per Rock
- **Client Tagging**: Optional client_id for client-specific Rocks
- **Meeting Review**: Discussed weekly in Level 10 meetings

#### 4.4.3 Client Filtering
```typescript
// Query rocks by client
const getClientRocks = async (clientId: string, quarter: string) => {
  const { data } = await supabase
    .from('eos_rocks')
    .select('*')
    .eq('client_id', clientId)
    .eq('quarter_start', getQuarterStart(quarter));
  return data;
};
```

### 4.5 Issues List

#### 4.5.1 Overview
Central repository of problems, obstacles, and opportunities requiring resolution via IDS (Identify, Discuss, Solve).

#### 4.5.2 Functionality
- **Lifecycle**: Open → Discussing → Solved
- **Priority Ranking**: 1 (urgent) to 5 (low)
- **Client Tagging**: Associate issue with specific client
- **Assignment**: Assignee responsible for resolution
- **Meeting Integration**: Top 3 issues tackled in IDS segment

#### 4.5.3 IDS Process
1. **Identify**: Clearly state the issue (title + description)
2. **Discuss**: Root cause analysis, perspectives
3. **Solve**: Actionable solution, assign To-Do if needed

#### 4.5.4 Client Filtering
```typescript
// Filter issues by client
interface IssueFilters {
  clientId?: string;
  status?: 'open' | 'discussing' | 'solved';
  priority?: 1 | 2 | 3 | 4 | 5;
}
```

### 4.6 Level 10 Meetings

#### 4.6.1 Overview
Weekly 90-minute structured meeting with 7 segments following strict agenda.

#### 4.6.2 Agenda Structure
| Segment      | Duration | Purpose                                    |
|--------------|----------|--------------------------------------------|
| Segue        | 5 min    | Good news, personal/professional updates   |
| Scorecard    | 5 min    | Review weekly metrics, discuss red items   |
| Rocks Review | 5 min    | Update status of quarterly Rocks (on/off)  |
| Headlines    | 5 min    | Quick updates, announcements (no discussion)|
| To-Dos       | 5 min    | Review last week's To-Dos (done/not done)  |
| IDS          | 60 min   | Identify/Discuss/Solve top 3 issues        |
| Conclude     | 5 min    | Recap To-Dos, rate meeting (1-10), cascade |

#### 4.6.3 Real-time Synchronization
```typescript
// Supabase Realtime channel per meeting
const meetingChannel = supabase
  .channel(`eos-meeting-${meetingId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'eos_meeting_segments',
    filter: `meeting_id=eq.${meetingId}`
  }, (payload) => {
    // Update UI in real-time
    updateSegmentStatus(payload.new);
  })
  .subscribe();
```

#### 4.6.4 Meeting Flow Control
- **Facilitator Controls**: Advance to next segment, extend time
- **Timer**: Visual countdown per segment
- **Participant Actions**: Add headlines, update Rocks, mark To-Dos
- **Scribe**: Document notes during IDS segment

#### 4.6.5 Meeting Archive
On meeting conclusion:
1. Generate snapshot (JSONB) of all data
2. Store in `eos_meetings.agenda` field
3. Create To-Dos from IDS solutions
4. Send meeting summary email to participants

### 4.7 To-Dos

#### 4.7.1 Overview
Action items with owner, due date, and completion tracking.

#### 4.7.2 Sources
- Created during IDS segment of meetings
- Manually added outside of meetings
- Converted from Issues upon solving

#### 4.7.3 Review Process
- Reviewed weekly in Level 10 meeting
- Binary status: Done / Not done
- Not done items carry over to next week with updated priority

---

## 5. Permissions & Roles

### 5.1 Role Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│                         Admin                           │
│  - Full access to all modules                           │
│  - Manage V/TO, Accountability Chart                    │
│  - Assign roles                                         │
│  - Access all meetings                                  │
└───────────────────┬─────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
┌───────▼────────┐     ┌────────▼────────┐
│  Facilitator   │     │     Scribe      │
│  - Lead meeting│     │  - Doc notes    │
│  - Control     │     │  - Meeting      │
│    agenda      │     │    minutes      │
│  - Advance     │     └─────────────────┘
│    segments    │
└───────┬────────┘
        │
┌───────▼────────────────────────────────────┐
│              Participant                    │
│  - View all data                            │
│  - Update own Rocks                         │
│  - Add Issues                               │
│  - Complete To-Dos                          │
│  - Contribute in meetings                   │
└───────┬────────────────────────────────────┘
        │
┌───────▼────────────────────────────────────┐
│          Client Viewer                      │
│  - Read-only access                         │
│  - View client-tagged Rocks/Issues only     │
│  - No meeting participation                 │
└─────────────────────────────────────────────┘
```

### 5.2 RLS Policies

```sql
-- Example: eos_rocks policies
CREATE POLICY "Users can view their tenant rocks"
  ON eos_rocks FOR SELECT
  USING (tenant_id = get_current_user_tenant());

CREATE POLICY "Admins can manage all rocks"
  ON eos_rocks FOR ALL
  USING (has_eos_role(auth.uid(), 'admin'));

CREATE POLICY "Participants can update their own rocks"
  ON eos_rocks FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Client viewers can only see client-tagged rocks"
  ON eos_rocks FOR SELECT
  USING (
    has_eos_role(auth.uid(), 'client_viewer')
    AND client_id IN (
      SELECT client_id FROM user_client_access WHERE user_uuid = auth.uid()
    )
  );
```

### 5.3 Permission Matrix

| Action                         | Admin | Facilitator | Scribe | Participant | Client Viewer |
|--------------------------------|-------|-------------|--------|-------------|---------------|
| Edit V/TO                      | ✅    | ✅          | ❌     | ❌          | ❌            |
| Edit Accountability Chart      | ✅    | ✅          | ❌     | ❌          | ❌            |
| Create Scorecard Metrics       | ✅    | ✅          | ❌     | ❌          | ❌            |
| Enter Scorecard Data           | ✅    | ✅          | ✅     | ✅ (own)    | ❌            |
| Create Rocks                   | ✅    | ✅          | ❌     | ✅          | ❌            |
| Update Own Rocks               | ✅    | ✅          | ✅     | ✅          | ❌            |
| Create Issues                  | ✅    | ✅          | ✅     | ✅          | ❌            |
| Solve Issues                   | ✅    | ✅          | ✅     | ✅          | ❌            |
| Create Meetings                | ✅    | ✅          | ❌     | ❌          | ❌            |
| Lead Meeting                   | ✅    | ✅          | ❌     | ❌          | ❌            |
| Take Meeting Notes             | ✅    | ✅          | ✅     | ❌          | ❌            |
| Participate in Meeting         | ✅    | ✅          | ✅     | ✅          | ❌            |
| View Client-Tagged Data        | ✅    | ✅          | ✅     | ✅          | ✅ (filtered) |
| Create To-Dos                  | ✅    | ✅          | ✅     | ✅          | ❌            |
| Complete To-Dos                | ✅    | ✅          | ✅     | ✅ (own)    | ❌            |

---

## 6. Integration Points

### 6.1 Internal Integrations

#### 6.1.1 Existing Clients Module
- **Link**: `eos_rocks.client_id` → `clients_legacy.id`
- **Link**: `eos_issues.client_id` → `clients_legacy.id`
- **Use Case**: Tag Rocks and Issues with specific clients for reporting

#### 6.1.2 Existing Users/Tenants
- **Link**: `eos_user_roles.user_uuid` → `users.user_uuid`
- **Link**: `eos_user_roles.tenant_id` → `tenants.id`
- **Use Case**: Multi-tenant isolation, user permission management

#### 6.1.3 Calendar Module
- **Link**: Create calendar entries for scheduled Level 10 meetings
- **Sync**: Meeting date/time → `calendar_entries`
- **Notifications**: Remind participants 1 hour before meeting

#### 6.1.4 Notifications System
- **Triggers**:
  - Rock goes off-track → Notify owner + facilitator
  - Issue unresolved >2 weeks → Notify assignee
  - Meeting starting in 1 hour → Notify all participants
  - To-Do overdue → Notify assignee

### 6.2 External Integrations (Future)

#### 6.2.1 ClickUp
- Sync To-Dos with ClickUp tasks
- Import ClickUp tasks as Issues
- Two-way sync with `clickup_integration` table

#### 6.2.2 Reporting/Analytics
- Export Rocks completion rates by quarter
- Scorecard trend analysis
- Issue resolution time metrics
- Meeting attendance tracking

---

## 7. User Flows

### 7.1 Creating a New Quarter's Rocks

```
Facilitator/Admin:
1. Navigate to Rocks page
2. Click "Start New Quarter" (if not already created)
3. System auto-populates quarter dates (Q1: Jan 1 - Mar 31, etc.)
4. Add Company Rocks (3-7):
   - Title
   - Description
   - Owner (dropdown of users)
   - Rock type: Company
5. Team members add their own Team Rocks
6. For client-specific deliverables:
   - Add Rock with type: Client
   - Tag with client_id from dropdown
7. Save and publish
8. Rocks appear in weekly Level 10 meeting agenda
```

### 7.2 Conducting a Level 10 Meeting

```
Pre-Meeting (Facilitator):
1. Navigate to Meetings page
2. Click "Start New Meeting" (auto-scheduled for current week)
3. System generates agenda:
   - Loads active Rocks (status check)
   - Loads open Issues (top 3 by priority)
   - Loads last week's To-Dos (done/not done review)
   - Loads Scorecard metrics (for current week)
4. Assign participants (auto-invite team members)
5. Assign scribe (optional)
6. Click "Start Meeting" → Status: In Progress

During Meeting (Real-time sync):
1. Segue (5 min):
   - Each participant shares good news
   - Scribe documents key points
2. Scorecard (5 min):
   - Review each metric (auto-highlighted if red)
   - Discuss red metrics briefly
   - Create Issue if metric requires deeper discussion
3. Rocks Review (5 min):
   - Each Rock owner updates status: On Track / Off Track
   - Percentage completion updated
   - No discussion, just status update
4. Headlines (5 min):
   - Participants add quick updates (text input)
   - No discussion, just information sharing
5. To-Dos (5 min):
   - Review last week's To-Dos
   - Mark as Done or carry over
6. IDS (60 min):
   - Facilitator selects top 3 issues from Issues List
   - For each issue:
     a. Identify: Restate the problem clearly
     b. Discuss: Root cause, perspectives (time-boxed)
     c. Solve: Actionable solution, create To-Do(s)
   - Mark issue as Solved
7. Conclude (5 min):
   - Scribe reads back new To-Dos
   - Participants rate meeting (1-10)
   - Facilitator cascades key messages
   - Click "End Meeting" → Status: Completed

Post-Meeting (Automatic):
1. System archives meeting snapshot
2. Creates To-Dos with assignees and due dates
3. Sends email summary to all participants
4. Updates Issue statuses
```

### 7.3 Client-Specific Reporting

```
User (any role):
1. Navigate to Reports page
2. Select "Client Reports"
3. Choose client from dropdown (filters to assigned clients)
4. Select report type:
   - Rocks Progress: Shows client-tagged Rocks, completion %, owners
   - Open Issues: Shows client-tagged Issues, status, priority
   - Meeting History: Shows meetings where client-tagged items discussed
5. Set date range (quarter, year, custom)
6. Click "Generate Report"
7. View data in dashboard format
8. Export as PDF/CSV

Client Viewer (limited access):
1. Login with client_viewer role
2. Dashboard shows only client-tagged items:
   - Their Rocks (read-only)
   - Their Issues (read-only, can comment)
   - Meeting summaries (if discussed)
3. Cannot see internal company/team items
4. Cannot participate in live meetings
```

---

## 8. Technical Considerations

### 8.1 Real-time Synchronization

#### 8.1.1 Supabase Realtime Channels
```typescript
// Meeting room channel
const setupMeetingChannel = (meetingId: string) => {
  const channel = supabase.channel(`meeting:${meetingId}`);
  
  // Listen to segment updates
  channel.on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'eos_meeting_segments',
    filter: `meeting_id=eq.${meetingId}`
  }, (payload) => {
    // Update UI segment progress
    dispatch(updateSegment(payload.new));
  });
  
  // Listen to participant actions
  channel.on('broadcast', { event: 'participant-action' }, (payload) => {
    // Handle real-time participant updates
    handleParticipantAction(payload);
  });
  
  return channel.subscribe();
};
```

#### 8.1.2 Optimistic Updates
- Client-side state updates before server confirmation
- Rollback on error
- Visual indicators (loading spinners, success toasts)

### 8.2 Data Versioning

#### 8.2.1 V/TO Versioning Strategy
- **Immutable Versions**: Each version is a complete snapshot
- **Diff Tracking**: Not implemented (full snapshots only)
- **Storage**: JSONB in `eos_vto_versions.core_values`, etc.
- **Activation**: Only one `is_active = true` per tenant

#### 8.2.2 Meeting Archives
- **Snapshot**: Entire meeting state captured in `eos_meetings.agenda` JSONB
- **Retention**: Indefinite (no auto-deletion)
- **Replay**: Frontend can reconstruct meeting flow from snapshot

### 8.3 Performance Optimization

#### 8.3.1 Caching Strategy
- **V/TO Active Version**: Cache for 1 hour (low update frequency)
- **Scorecard Metrics**: Cache for 15 minutes
- **Meetings List**: Cache for 5 minutes
- **Real-time Data**: No cache (use Supabase Realtime)

#### 8.3.2 Query Optimization
```sql
-- Example: Efficient Rock loading with owner details
CREATE VIEW eos_rocks_with_owners AS
SELECT 
  r.*,
  u.first_name || ' ' || u.last_name AS owner_name,
  u.email AS owner_email,
  c.contactname AS client_name
FROM eos_rocks r
LEFT JOIN users u ON r.owner_id = u.user_uuid
LEFT JOIN clients_legacy c ON r.client_id = c.id;
```

### 8.4 Notification System

#### 8.4.1 Email Templates
- `eos-meeting-reminder`: 1 hour before meeting
- `eos-meeting-summary`: Post-meeting recap with To-Dos
- `eos-rock-off-track`: When Rock status changes to off_track
- `eos-todo-overdue`: Daily digest of overdue To-Dos

#### 8.4.2 Edge Function: `eos-notifications`
```typescript
// Deno edge function
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const { type, payload } = await req.json();
  
  switch (type) {
    case 'meeting-reminder':
      return sendMeetingReminder(payload);
    case 'rock-alert':
      return sendRockAlert(payload);
    case 'todo-digest':
      return sendTodoDigest(payload);
    default:
      return new Response('Invalid type', { status: 400 });
  }
});
```

### 8.5 Security Considerations

#### 8.5.1 RLS Enforcement
- **Mandatory RLS** on all EOS tables
- **Tenant Isolation**: `tenant_id = get_current_user_tenant()`
- **Role-based Access**: `has_eos_role(auth.uid(), 'role')`

#### 8.5.2 Client Viewer Restrictions
```sql
-- Ensure client_viewers only access assigned clients
CREATE TABLE user_client_access (
  user_uuid UUID REFERENCES users(user_uuid),
  client_id UUID REFERENCES clients_legacy(id),
  granted_by UUID REFERENCES users(user_uuid),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_uuid, client_id)
);

-- RLS policy example
CREATE POLICY "Client viewers restricted to assigned clients"
  ON eos_rocks FOR SELECT
  USING (
    CASE 
      WHEN has_eos_role(auth.uid(), 'client_viewer') THEN
        client_id IN (
          SELECT client_id FROM user_client_access WHERE user_uuid = auth.uid()
        )
      ELSE true
    END
  );
```

---

## 9. Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
**Goal:** Database schema, auth, basic UI scaffolding

- [ ] Create all database tables
- [ ] Implement RLS policies
- [ ] Create `eos_user_roles` and permission functions
- [ ] Build basic React routing (`/eos/*`)
- [ ] Create shared UI components (Layout, Navigation)

**Deliverables:**
- Migrated database schema
- Auth middleware for EOS roles
- Empty page shells for all modules

---

### Phase 2: V/TO & Accountability Chart (Weeks 3-4)
**Goal:** Strategic planning tools

- [ ] V/TO form with 8 sections
- [ ] Version control UI
- [ ] Accountability Chart drag-and-drop editor
- [ ] Role responsibility management
- [ ] Seat assignment interface

**Deliverables:**
- Functional V/TO creator/editor
- Visual Accountability Chart builder
- Version history viewer

---

### Phase 3: Scorecard & Rocks (Weeks 5-6)
**Goal:** Operational tracking

- [ ] Scorecard metric creation
- [ ] Weekly data entry form
- [ ] 13-week trend charts
- [ ] Rocks management (create, update, status)
- [ ] Quarterly cycle management
- [ ] Client tagging for Rocks

**Deliverables:**
- Scorecard dashboard with charts
- Rocks board (Kanban-style view)
- Client-tagged Rocks filtering

---

### Phase 4: Issues & To-Dos (Weeks 7-8)
**Goal:** Problem tracking

- [ ] Issues list with priority sorting
- [ ] IDS workflow (Identify, Discuss, Solve)
- [ ] Client tagging for Issues
- [ ] To-Dos management
- [ ] To-Do <-> Issue linking

**Deliverables:**
- Issues dashboard
- IDS process UI
- To-Dos with due dates and owners

---

### Phase 5: Level 10 Meetings (Weeks 9-11)
**Goal:** Core meeting functionality

- [ ] Meeting scheduler
- [ ] Agenda auto-generation
- [ ] Real-time meeting room
- [ ] Segment timer and controls
- [ ] Facilitator controls (advance, extend time)
- [ ] Scribe note-taking interface
- [ ] Participant interaction (update Rocks, mark To-Dos)
- [ ] Meeting archive/snapshot

**Deliverables:**
- Fully functional Level 10 meeting interface
- Real-time synchronization across participants
- Meeting history viewer

---

### Phase 6: Integrations & Reports (Weeks 12-13)
**Goal:** Connect to existing modules, reporting

- [ ] Calendar integration (meeting scheduling)
- [ ] Notification system (emails, in-app)
- [ ] Client-specific reports
- [ ] Rocks completion analytics
- [ ] Scorecard trend reports
- [ ] Issue resolution metrics

**Deliverables:**
- Client reporting dashboard
- Email notifications for key events
- Analytics dashboards

---

### Phase 7: Polish & Testing (Weeks 14-15)
**Goal:** Production readiness

- [ ] Comprehensive testing (unit, integration, E2E)
- [ ] Performance optimization
- [ ] Mobile responsiveness
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] User acceptance testing (UAT)
- [ ] Documentation (user guides, admin guides)

**Deliverables:**
- Tested, production-ready EOS module
- User documentation
- Admin training materials

---

### Phase 8: Client Viewer Access (Week 16)
**Goal:** Limited client access

- [ ] Client viewer role enforcement
- [ ] Client-specific dashboards
- [ ] Read-only views for client-tagged items
- [ ] Client commenting on Issues (optional)

**Deliverables:**
- Client viewer login flow
- Client-facing portal

---

## 10. API Reference

### 10.1 Edge Functions

#### `eos-vto`
```typescript
POST /eos-vto/create
Body: {
  core_values: string[],
  core_focus: string,
  ten_year_target: string,
  // ... other V/TO fields
}
Response: { id: UUID, version_number: number }

GET /eos-vto/active/:tenantId
Response: { ...vto_data }

PUT /eos-vto/:id/update
Body: { section: string, value: any }
Response: { success: boolean }
```

#### `eos-meetings`
```typescript
POST /eos-meetings/create
Body: {
  meeting_date: Date,
  scheduled_time: Time,
  facilitator_id: UUID,
  scribe_id: UUID,
  participant_ids: UUID[]
}
Response: { id: UUID, agenda: JSONB }

POST /eos-meetings/:id/start
Response: { status: 'in_progress', started_at: Timestamp }

PUT /eos-meetings/:id/advance-segment
Body: { current_segment_id: UUID }
Response: { next_segment: JSONB }

POST /eos-meetings/:id/conclude
Body: { meeting_rating: number, new_todos: Todo[] }
Response: { status: 'completed', concluded_at: Timestamp }
```

#### `eos-rocks`
```typescript
POST /eos-rocks/create
Body: {
  title: string,
  description: string,
  owner_id: UUID,
  rock_type: 'company' | 'team' | 'client',
  client_id?: UUID,
  quarter_start: Date,
  quarter_end: Date
}
Response: { id: UUID }

PUT /eos-rocks/:id/update-status
Body: { status: 'on_track' | 'off_track' | 'complete', completion_percentage: number }
Response: { success: boolean }
```

#### `eos-notifications`
```typescript
POST /eos-notifications/send
Body: {
  type: 'meeting-reminder' | 'rock-alert' | 'todo-digest',
  recipient_ids: UUID[],
  payload: JSONB
}
Response: { sent: number, failed: number }
```

---

## 11. Testing Strategy

### 11.1 Unit Tests
- **Database Functions**: Test RLS policies, permission checks
- **Edge Functions**: Test API endpoints, input validation
- **React Components**: Test UI interactions, state management

### 11.2 Integration Tests
- **Meeting Flow**: Complete Level 10 meeting from start to conclude
- **Real-time Sync**: Multiple participants in same meeting
- **Client Tagging**: Filter and report on client-specific data
- **Permissions**: Role-based access enforcement

### 11.3 E2E Tests (Playwright)
```typescript
// Example: Complete Level 10 meeting
test('Facilitator conducts full Level 10 meeting', async ({ page }) => {
  await page.goto('/eos/meetings');
  await page.click('text=Start New Meeting');
  await page.click('text=Start Meeting');
  
  // Segue
  await page.fill('[data-testid="segue-notes"]', 'Good news shared');
  await page.click('text=Next Segment');
  
  // Scorecard
  await page.waitForSelector('[data-testid="scorecard-grid"]');
  await page.click('text=Next Segment');
  
  // ... continue through all segments
  
  await page.click('text=End Meeting');
  await page.waitForSelector('text=Meeting Concluded');
});
```

---

## 12. Success Metrics

### 12.1 Adoption Metrics
- **Users with EOS roles assigned**: Target 80% of active users
- **Meetings conducted per week**: Target 1 per team (90% completion rate)
- **Rocks created per quarter**: Target 5-7 per team
- **Issues resolved per quarter**: Target 80% of identified issues

### 12.2 Engagement Metrics
- **Meeting attendance rate**: Target >90%
- **Meeting rating (1-10)**: Target average >8
- **Rocks on-track rate**: Target >70%
- **To-Do completion rate**: Target >85%

### 12.3 System Metrics
- **Page load time**: <2 seconds for all pages
- **Real-time sync latency**: <500ms for meeting updates
- **Uptime**: 99.9% availability
- **Database query performance**: <100ms for 95th percentile

---

## 13. Future Enhancements

### 13.1 Advanced Analytics
- Predictive Rock completion modeling
- Trend analysis for recurring Issues
- Team health scoring based on meeting ratings

### 13.2 AI Integration
- AI-powered issue root cause suggestions
- Automated To-Do generation from meeting notes
- Smart Rock recommendations based on V/TO goals

### 13.3 Mobile App
- Native iOS/Android app for meeting participation
- Offline mode for Rocks and To-Dos updates
- Push notifications for meeting reminders

### 13.4 External Integrations
- Slack integration for meeting notifications
- Microsoft Teams integration for meeting links
- Google Calendar sync for meeting scheduling
- Zapier/Make.com integrations for workflow automation

---

## 14. Glossary

| Term                  | Definition                                                                 |
|-----------------------|----------------------------------------------------------------------------|
| **EOS**               | Entrepreneurial Operating System - business management methodology        |
| **Level 10 Meeting**  | 90-minute weekly structured meeting with 7 segments                       |
| **V/TO**              | Vision/Traction Organizer - strategic planning document with 8 components |
| **Rocks**             | Quarterly priorities (90-day goals)                                       |
| **IDS**               | Identify, Discuss, Solve - problem resolution framework                   |
| **Scorecard**         | Weekly metrics dashboard (5-15 measurables)                               |
| **Accountability Chart** | Organizational chart with roles and responsibilities                   |
| **Headlines**         | Quick updates shared in meeting (no discussion)                           |
| **To-Dos**            | Action items with owner and due date                                      |
| **Segue**             | Meeting opening for personal/professional good news                       |
| **Facilitator**       | Person leading the Level 10 meeting                                       |
| **Scribe**            | Person documenting meeting notes                                          |

---

## 15. Appendices

### Appendix A: EOS Resources
- **Book**: "Traction" by Gino Wickman
- **Website**: [eosworldwide.com](https://www.eosworldwide.com)
- **V/TO Template**: Provided by EOS Worldwide

### Appendix B: Example V/TO
```json
{
  "core_values": [
    "Do the Right Thing",
    "Seek Clarity",
    "Be Relentless",
    "Own It",
    "Have Fun"
  ],
  "core_focus": "Simplify business operations for growing companies",
  "ten_year_target": "$100M ARR, 500 clients, industry leader",
  "marketing_strategy": {
    "target": "Scaling B2B service companies (10-100 employees)",
    "message": "Get your business organized and on track",
    "channels": ["Content marketing", "Partnerships", "Referrals"]
  },
  "three_year_picture": "Q4 2027: $25M ARR, 150 clients, 50 employees, recognized EOS platform leader",
  "one_year_plan": [
    "Launch EOS module (Q1 2025)",
    "Achieve 50 active EOS clients (by Q4 2025)",
    "$5M ARR (by Dec 2025)",
    "Build integrations with top 5 project management tools",
    "Establish strategic partnerships with 3 EOS implementers"
  ]
}
```

### Appendix C: Meeting Snapshot Example
```json
{
  "meeting_id": "uuid-123",
  "meeting_date": "2025-01-15",
  "facilitator": "Jane Doe",
  "scribe": "John Smith",
  "participants": ["Jane Doe", "John Smith", "Alice Johnson", "Bob Williams"],
  "segments": {
    "segue": {
      "duration": 5,
      "notes": "Team shared personal wins, new client signed this week"
    },
    "scorecard": {
      "duration": 5,
      "metrics_reviewed": 12,
      "red_metrics": 2,
      "notes": "Revenue and NPS below goal, discussed briefly"
    },
    "rocks": {
      "duration": 5,
      "total_rocks": 14,
      "on_track": 10,
      "off_track": 3,
      "complete": 1
    },
    "headlines": {
      "duration": 5,
      "headlines": [
        "New partnership with Company X finalized",
        "Q1 marketing campaign launched",
        "Office move scheduled for March"
      ]
    },
    "todos": {
      "duration": 5,
      "reviewed": 8,
      "completed": 6,
      "carried_over": 2
    },
    "ids": {
      "duration": 60,
      "issues_solved": 3,
      "issues": [
        {
          "title": "Client onboarding taking too long",
          "solution": "Implement automated onboarding checklist",
          "todos_created": 2
        },
        {
          "title": "Support response time >24h",
          "solution": "Hire additional support agent, reassign tickets",
          "todos_created": 3
        },
        {
          "title": "Q1 product roadmap unclear",
          "solution": "Schedule roadmap review meeting with product team",
          "todos_created": 1
        }
      ]
    },
    "conclude": {
      "duration": 5,
      "todos_recap": 6,
      "meeting_rating": 9,
      "cascade_message": "Onboarding improvements and support expansion underway"
    }
  },
  "new_todos": [
    { "title": "Build onboarding checklist template", "assigned_to": "Alice", "due_date": "2025-01-22" },
    { "title": "Post job listing for support agent", "assigned_to": "Jane", "due_date": "2025-01-18" },
    { "title": "Schedule roadmap meeting", "assigned_to": "Bob", "due_date": "2025-01-17" }
  ]
}
```

---

**End of Specification Document**

---

## Document Control

| Version | Date       | Author        | Changes                          |
|---------|------------|---------------|----------------------------------|
| 1.0     | 2025-10-08 | Lovable AI    | Initial specification document   |

---

**Approval Signatures**

Product Owner: ___________________________  Date: __________

Technical Lead: ___________________________  Date: __________

---

*This document is the source of truth for the EOS Level 10 Meeting module implementation in VivacityCMS/Unicorn 2.0. All development should reference this specification.*
