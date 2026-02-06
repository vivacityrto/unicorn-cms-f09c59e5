

# Work Calendar Feature Implementation Plan

## Summary

Build a new **Work > Calendar** page at `/work/calendar` that displays synced Outlook events with Day/Week/Month views. The system will use cached calendar events with a new sharing model that allows assistants to view consultants' calendars securely. Microsoft OAuth tokens remain strictly per-user with no cross-user access.

---

## Architecture Overview

```text
+-----------------------+          +---------------------+
|   calendar_events     |          |   calendar_shares   |
|   (existing table)    |          |   (new table)       |
+-----------+-----------+          +----------+----------+
            |                                 |
            |  owner_user_uuid = user_id      |  owner_user_uuid
            |                                 |  viewer_user_uuid
            v                                 v
+-----------+---------------------------------+----------+
|                      RLS Policies                      |
|  - Users see own events                                |
|  - Assistants see events if share exists               |
|  - Redacted view for busy_only scope                   |
+--------------------------------------------------------+
                            |
                            v
+---------------------------+---------------------------+
|         Work Calendar Page (/work/calendar)           |
|  +------------+  +------------+  +--------------+     |
|  | Day View   |  | Week View  |  | Month View   |     |
|  +------------+  +------------+  +--------------+     |
|                                                       |
|  [ Owner Selector ] - My calendar / Shared calendars  |
|  [ Filters ] - Client-linked only / All events        |
+-------------------------------------------------------+
```

---

## Part A: Navigation Changes

### 1. Update Sidebar Navigation

**File:** `src/components/DashboardLayout.tsx`

Update the WORK section menu items to rename "Event Calendar" to "Calendar" and change the route:

```text
Current: { icon: Calendar, label: "Event Calendar", path: "/calendar" }
New:     { icon: Calendar, label: "Calendar",       path: "/work/calendar" }
```

The existing `/calendar` route will remain as "Vivacity Events Calendar" (external AddEvent calendar) if needed for backwards compatibility, or redirect to `/work/calendar`.

### 2. Add Route in App.tsx

**File:** `src/App.tsx`

- Add lazy import for new `WorkCalendar` page
- Add protected route at `/work/calendar`

---

## Part B: Database Schema Changes

### 1. New Table: `calendar_shares`

Allows a calendar owner to grant viewing access to another user (assistant).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| owner_user_uuid | uuid | NOT NULL, FK to users.user_uuid |
| viewer_user_uuid | uuid | NOT NULL, FK to users.user_uuid |
| permission | text | NOT NULL, default 'view' |
| scope | text | NOT NULL, default 'busy_only' (busy_only, details) |
| created_by | uuid | NOT NULL, who created the share |
| created_at | timestamptz | default now() |

**Constraints:**
- UNIQUE(owner_user_uuid, viewer_user_uuid)
- CHECK: owner_user_uuid != viewer_user_uuid

### 2. Add Optional Columns to calendar_events

| Column | Purpose |
|--------|---------|
| client_id | bigint, FK to tenants.id - links event to a client |
| package_id | bigint, FK to packages.id - links event to a package |
| sensitivity | text - 'normal' or 'private' (from Microsoft Graph) |

### 3. Secure View: `calendar_events_shared`

For assistants with `busy_only` scope, return redacted event data:

```sql
CREATE VIEW calendar_events_shared AS
SELECT 
  ce.id,
  ce.user_id as owner_user_uuid,
  ce.start_at,
  ce.end_at,
  ce.status,
  CASE 
    WHEN ce.user_id = auth.uid() THEN ce.title
    WHEN cs.scope = 'details' THEN ce.title
    ELSE 'Busy'
  END as title,
  CASE 
    WHEN ce.user_id = auth.uid() THEN ce.location
    WHEN cs.scope = 'details' THEN ce.location
    ELSE NULL
  END as location,
  -- Similar redaction for attendees, description
  ce.client_id,
  ce.package_id,
  cs.scope as share_scope
FROM calendar_events ce
LEFT JOIN calendar_shares cs 
  ON cs.owner_user_uuid = ce.user_id 
  AND cs.viewer_user_uuid = auth.uid()
WHERE ce.user_id = auth.uid() 
   OR cs.viewer_user_uuid IS NOT NULL;
```

### 4. RLS Policies

**calendar_shares:**
- SELECT: Users can see shares where they are owner or viewer
- INSERT: Users can create shares where they are the owner
- DELETE: Users can remove shares where they are the owner
- SuperAdmin can manage all shares (with audit logging)

**calendar_events (update existing):**
- Extend SELECT policy to include shared events via the view pattern

### 5. Audit Log Table: `calendar_share_audit`

| Column | Type |
|--------|------|
| id | uuid PK |
| action | text (share_created, share_revoked) |
| owner_user_uuid | uuid |
| viewer_user_uuid | uuid |
| performed_by | uuid |
| scope | text |
| created_at | timestamptz |

---

## Part C: Work Calendar Page

### 1. Create Page Component

**File:** `src/pages/WorkCalendar.tsx`

**Layout:**
```text
+----------------------------------------------------------+
|  [ Owner Selector v ]    [ < ]  Feb 2026  [ > ]  [D W M] |
+----------------------------------------------------------+
|  [ ] Client-linked only   [ ] All events                  |
+----------------------------------------------------------+
|                                                          |
|  +-------+-------+-------+-------+-------+-------+------+|
|  | Mon   | Tue   | Wed   | Thu   | Fri   | Sat   | Sun  ||
|  +-------+-------+-------+-------+-------+-------+------+|
|  |       |       |  9am  |       |       |       |      ||
|  |       |       | Meeting|      |       |       |      ||
|  |       |       | [Link] |      |       |       |      ||
|  +-------+-------+-------+-------+-------+-------+------+|
|                                                          |
+----------------------------------------------------------+
```

**Features:**
- **View Modes:** Day, Week, Month (default: Week)
- **Owner Selector:** "My calendar" plus any calendars shared with the user
- **Date Navigation:** Previous/Next buttons, date picker
- **Filters:** Toggle for "Client-linked only" and "Show all"

### 2. Event Cards

Each event card displays:
- Title (or "Busy" if redacted)
- Time range
- Client badge (if linked)
- Location (if available and not redacted)

**Quick Actions (on hover/click):**
- "Create time draft" - calls existing `rpc_create_time_draft_from_event`
- "Link to client" - opens dialog to select client (updates client_id)

### 3. Calendar View Component

Use a custom calendar grid built with:
- date-fns for date calculations (already installed)
- Tailwind CSS for styling
- Support for responsive layout

No new dependencies required - build using existing primitives.

### 4. State Management

**File:** `src/hooks/useWorkCalendar.tsx`

```typescript
interface WorkCalendarState {
  view: 'day' | 'week' | 'month';
  currentDate: Date;
  ownerUserId: string; // auth.uid() for "my calendar" or shared user's ID
  showClientLinkedOnly: boolean;
  events: CalendarEvent[];
  loading: boolean;
}
```

**Functions:**
- `fetchEvents(startDate, endDate, ownerId)` - fetch from calendar_events_shared view
- `linkEventToClient(eventId, clientId)` - update calendar_events.client_id
- `createTimeDraft(eventId)` - reuse existing RPC

---

## Part D: Settings > Calendar Tab Enhancement

### 1. Add Calendar Sharing Section

**File:** `src/components/settings/CalendarTab.tsx`

Add a new section below the Outlook integration card:

```text
+----------------------------------------------------------+
|  Calendar Sharing                                         |
|  Share your calendar with Vivacity team members          |
+----------------------------------------------------------+
|  [ + Add Share ]                                          |
|                                                          |
|  +------------------------------------------------------+|
|  | Sarah Jones                 Busy Only    [ Revoke ]  ||
|  | Michael Chen                Details      [ Revoke ]  ||
|  +------------------------------------------------------+|
+----------------------------------------------------------+
```

**Add Share Dialog:**
- Select team member (dropdown of Vivacity Team users)
- Select scope: "Busy only" or "Full details"
- Save button

### 2. Share Management Hook

**File:** `src/hooks/useCalendarShares.tsx`

```typescript
interface CalendarShare {
  id: string;
  owner_user_uuid: string;
  viewer_user_uuid: string;
  viewer_name: string;
  scope: 'busy_only' | 'details';
  created_at: string;
}

// Functions
- fetchMyShares(): CalendarShare[]
- createShare(viewerUserId, scope): void
- revokeShare(shareId): void
```

---

## Part E: Integration with Existing Features

### 1. Time Inbox Changes

**File:** `src/pages/TimeInbox.tsx`

No changes needed - Time Inbox already works with the existing `calendar_events` and `calendar_time_drafts` tables. The Work Calendar is a separate view for browsing events.

### 2. Outlook Sync

**File:** `supabase/functions/sync-outlook-calendar/index.ts`

Add support for new fields during sync:
- Extract `sensitivity` from Microsoft Graph response
- Store in calendar_events.sensitivity

The sync continues to write only to the authenticated user's events.

---

## Technical Details

### File Changes Summary

| File | Action |
|------|--------|
| `src/components/DashboardLayout.tsx` | Update WORK menu item |
| `src/App.tsx` | Add /work/calendar route |
| `src/pages/WorkCalendar.tsx` | Create new page |
| `src/pages/WorkCalendarWrapper.tsx` | Create wrapper with layout |
| `src/hooks/useWorkCalendar.tsx` | Create calendar data hook |
| `src/hooks/useCalendarShares.tsx` | Create shares management hook |
| `src/components/settings/CalendarTab.tsx` | Add sharing section |
| `src/components/calendar/CalendarGrid.tsx` | Create calendar grid component |
| `src/components/calendar/CalendarEvent.tsx` | Create event card component |
| `src/components/calendar/CalendarOwnerSelector.tsx` | Create owner selector |
| `supabase/migrations/[timestamp].sql` | Schema changes |

### Database Migration

```sql
-- 1. Add new columns to calendar_events
ALTER TABLE calendar_events 
  ADD COLUMN IF NOT EXISTS client_id bigint REFERENCES tenants(id),
  ADD COLUMN IF NOT EXISTS package_id bigint REFERENCES packages(id),
  ADD COLUMN IF NOT EXISTS sensitivity text DEFAULT 'normal';

-- 2. Create calendar_shares table
CREATE TABLE calendar_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_uuid uuid NOT NULL REFERENCES users(user_uuid) ON DELETE CASCADE,
  viewer_user_uuid uuid NOT NULL REFERENCES users(user_uuid) ON DELETE CASCADE,
  permission text NOT NULL DEFAULT 'view',
  scope text NOT NULL DEFAULT 'busy_only' CHECK (scope IN ('busy_only', 'details')),
  created_by uuid NOT NULL REFERENCES users(user_uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_user_uuid, viewer_user_uuid),
  CHECK (owner_user_uuid != viewer_user_uuid)
);

-- 3. Create audit table
CREATE TABLE calendar_share_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  owner_user_uuid uuid NOT NULL,
  viewer_user_uuid uuid NOT NULL,
  performed_by uuid NOT NULL,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. RLS for calendar_shares
ALTER TABLE calendar_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own shares" ON calendar_shares
  FOR SELECT USING (
    owner_user_uuid = auth.uid() OR viewer_user_uuid = auth.uid()
  );

CREATE POLICY "Owners can create shares" ON calendar_shares
  FOR INSERT WITH CHECK (owner_user_uuid = auth.uid());

CREATE POLICY "Owners can revoke shares" ON calendar_shares
  FOR DELETE USING (owner_user_uuid = auth.uid());

-- 5. Create secure view for shared calendar access
CREATE VIEW calendar_events_shared WITH (security_invoker = true) AS
SELECT 
  ce.id,
  ce.user_id as owner_user_uuid,
  ce.start_at,
  ce.end_at,
  ce.status,
  ce.provider,
  ce.provider_event_id,
  CASE 
    WHEN ce.user_id = auth.uid() THEN ce.title
    WHEN cs.scope = 'details' THEN ce.title
    ELSE 'Busy'
  END as title,
  CASE 
    WHEN ce.user_id = auth.uid() THEN ce.location
    WHEN cs.scope = 'details' THEN ce.location
    ELSE NULL
  END as location,
  CASE 
    WHEN ce.user_id = auth.uid() THEN ce.attendees
    WHEN cs.scope = 'details' THEN ce.attendees
    ELSE '[]'::jsonb
  END as attendees,
  ce.client_id,
  ce.package_id,
  ce.sensitivity,
  COALESCE(cs.scope, 'owner') as access_scope
FROM calendar_events ce
LEFT JOIN calendar_shares cs 
  ON cs.owner_user_uuid = ce.user_id 
  AND cs.viewer_user_uuid = auth.uid()
WHERE ce.user_id = auth.uid() 
   OR cs.viewer_user_uuid IS NOT NULL;
```

### Security Considerations

1. **Token Isolation**: OAuth tokens in `oauth_tokens` remain strictly per-user. No changes to token access.

2. **RLS Enforcement**: All data access goes through RLS policies. The `calendar_events_shared` view uses `security_invoker = true` to enforce the querying user's permissions.

3. **Scope Redaction**: When an assistant has `busy_only` scope, event details (title, location, attendees) are redacted at the database level.

4. **Audit Trail**: All share create/revoke actions are logged to `calendar_share_audit`.

---

## Acceptance Criteria

1. Vivacity Team users can view their own calendar at `/work/calendar`
2. Day, Week, and Month views render correctly
3. Users can create time drafts from calendar events
4. Users can link events to clients
5. Users can share their calendar with scope control (busy_only vs details)
6. Assistants can view shared calendars with proper redaction
7. No cross-user token access - ever
8. Audit logs capture share create/revoke actions

