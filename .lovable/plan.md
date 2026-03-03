

# Phase 2: Unified Inbox for Communications + Tasks

## Problem Statement

Clients currently navigate between separate "Tasks" and "Communications" pages. Vivacity staff have no consolidated inbox. This phase merges both into a single Inbox view per portal, powered by a database view that normalises all sources.

## Architecture Decision: View-Based Unification (Not a New Table)

The platform has 5 distinct task source tables that are deeply integrated into the package-stage-task ecosystem:

- `client_task_instances` (bigint IDs, package-driven)
- `staff_task_instances` (bigint IDs, package-driven)
- `ops_work_items` (UUID IDs, operational)
- `client_action_items` (UUID IDs, meeting/ad-hoc)
- `compliance_task_instances` (UUID IDs, standards-driven)

The existing `tasks` table is a legacy ClickUp import (empty) and will not be repurposed.

**Decision**: We will NOT create a new canonical `tasks` table. Instead, we create `v_inbox_items` -- a read-only view that normalises all sources into a consistent schema. Writes go through existing table-specific mutations and new RPC functions.

This preserves the entire package-stage-task ecosystem, avoids data migration, and keeps all existing pages working.

---

## Sprint 1: Database -- v_inbox_items View + Helper RPCs

### A. Create `v_inbox_items` View

A `security_invoker = true` view that UNIONs:

**1. Messages (from tenant_conversations + messages + conversation_participants)**
```text
inbox_id:        'msg:' || message.id
tenant_id:       conversation.tenant_id
user_id:         participant.user_id
item_type:       CASE conversation.type
                   WHEN 'broadcast' THEN 'announcement'
                   WHEN 'rock' THEN 'rock'
                   ELSE 'message'
item_source:     'tenant_conversations'
source_id:       message.id
title:           conversation.subject OR conversation.topic
preview:         message.body (truncated 120 chars)
status:          conversation.status
due_at:          NULL
priority:        NULL
unread:          message.created_at > participant.last_read_at
action_required: unread
related_entity:  conversation.related_entity
related_entity_id: conversation.related_entity_id
created_at:      message.created_at
```

**2. Client Task Instances**
```text
inbox_id:        'cti:' || client_task_instances.id
tenant_id:       derived from stage_instance -> package_instance -> tenant_id
user_id:         NULL (tenant-scoped, not user-assigned)
item_type:       'task'
item_source:     'client_task_instances'
source_id:       client_task_instances.id (cast to text)
title:           client_tasks.name
preview:         stage.name || ' > ' || package.name
status:          mapped from integer status to text
due_at:          client_task_instances.due_date
priority:        client_tasks.priority
unread:          status IN (0) AND updated recently
action_required: overdue OR due_soon OR status = 0
```

**3. Client Action Items**
```text
inbox_id:        'cai:' || client_action_items.id
tenant_id:       client_action_items.tenant_id
user_id:         client_action_items.owner_user_id
item_type:       'task'
item_source:     'client_action_items'
...similar pattern
```

**4. Staff Task Instances (Team Inbox only)**
```text
inbox_id:        'sti:' || staff_task_instances.id
item_type:       'task'
item_source:     'staff_task_instances'
user_id:         staff_task_instances.assignee_id
```

**5. Ops Work Items (Team Inbox only)**
```text
inbox_id:        'owi:' || ops_work_items.id
item_type:       'task'
item_source:     'ops_work_items'
user_id:         ops_work_items.owner_user_uuid
```

The view uses `security_invoker = true` so RLS on the underlying tables controls visibility automatically.

### B. Helper RPC: `rpc_get_inbox_items`

A function wrapping the view with filters:

```text
rpc_get_inbox_items(
  p_user_id uuid,
  p_tenant_id bigint DEFAULT NULL,
  p_item_type text DEFAULT NULL,      -- 'message','task','announcement','rock'
  p_action_required boolean DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
```

Returns rows from `v_inbox_items` filtered for the calling user, sorted by: action_required DESC, unread DESC, created_at DESC.

### C. Helper RPC: `rpc_get_or_create_conversation`

```text
rpc_get_or_create_conversation(
  p_tenant_id bigint,
  p_type text,
  p_related_entity text,
  p_related_entity_id text
) RETURNS uuid
```

Finds existing conversation or creates new one + adds participants.

### D. Extend `v_user_notification_summary`

Add announcement count:

```text
COUNT(*) FILTER (WHERE type = 'broadcast' AND NOT is_read) AS unread_announcements
```

---

## Sprint 2: Client Portal Inbox

### A. New Route: `/client/inbox`

New files:
- `src/pages/client/ClientInboxWrapper.tsx`
- `src/pages/ClientInboxPage.tsx`
- `src/hooks/useClientInbox.ts`

### B. `useClientInbox` Hook

- Calls `rpc_get_inbox_items` with the client's tenant_id
- Accepts filter params (item_type, action_required)
- Returns typed `InboxItem[]` with loading/error states
- Provides `markRead` mutation (for messages -- updates `conversation_participants.last_read_at`)

### C. `ClientInboxPage` UI

**Layout**: Single-column feed (not split-pane)

**Top bar**: Filter chips -- All | Messages | Tasks | Announcements
**Sort**: Action required first, then newest

**Each row (InboxItemRow component)**:
- Type badge (Message, Task, Announcement) with colour coding
- Title
- Preview text (message body or task context: "Package > Stage")
- Status badge (for tasks)
- Due date (for tasks, with overdue/due-soon highlighting)
- Unread dot
- Action required indicator

**Row click behaviour**:
- Message/Announcement: Navigate to `/client/communications` with `?thread={conversation_id}` to open that thread
- Task: Navigate to `/client/tasks` with `?task={task_id}` to highlight/scroll to that task

### D. Sidebar Update

In `ClientSidebar.tsx`:
- Add "Inbox" as the first item (above Home) with `Inbox` icon
- Keep Tasks and Communications as separate links (they remain as filtered views)
- Add unread badge count on Inbox item using `v_user_notification_summary`

### E. Notification Bell Enhancement

In `ClientTopbar.tsx`:
- Bell turns red (destructive variant) when `total_unread > 0`
- Dropdown groups by type with counts: Messages (N), Tasks (N), Announcements (N)
- Click on group navigates to `/client/inbox?type={type}`

---

## Sprint 3: Team Portal Inbox

### A. New Route: `/inbox` (under Work section)

New files:
- `src/pages/TeamInboxWrapper.tsx`
- `src/pages/TeamInboxPage.tsx`
- `src/hooks/useTeamInbox.ts`

### B. `useTeamInbox` Hook

- Calls `rpc_get_inbox_items` with staff user_id
- Supports tenant filter, item_type filter, "my tenants" (CSC filter)
- Returns same `InboxItem[]` type

### C. `TeamInboxPage` UI

**Layout**: Two-panel (list left, detail right)

**Left panel**:
- Tenant filter dropdown
- "My Clients" toggle (filters to tenants where user is assigned CSC)
- Type filter chips: All | Messages | Tasks | Announcements
- Status filter: Action Required | All
- Inbox item rows (same InboxItemRow component as client)

**Right panel** (on row click):
- For messages: Thread view with composer (reuse from TeamCommunicationsPage)
- For tasks: Task detail card showing title, description, due date, status, context links

**Quick actions toolbar**:
- Reply (messages)
- Mark Complete (tasks -- calls existing status update RPCs)
- Reassign (future -- placeholder)

### D. Sidebar Update

In `DashboardLayout.tsx`:
- Add "Inbox" to Work section (below Dashboard, above My Work)
- With unread badge

---

## Sprint 4: Shared Components + Polish

### A. Shared `InboxItemRow` Component

`src/components/inbox/InboxItemRow.tsx`

Renders one inbox item consistently across both portals:
- Type badge with icon (MessageSquare, CheckSquare, Megaphone, Target)
- Title + preview
- Status + due date
- Unread dot + action indicator

### B. Shared `InboxFilters` Component

`src/components/inbox/InboxFilters.tsx`

Filter chip bar reusable in both Client and Team inbox pages.

### C. Type Definitions

`src/types/inbox.ts`

```text
interface InboxItem {
  inbox_id: string
  tenant_id: number
  user_id: string | null
  item_type: 'message' | 'task' | 'announcement' | 'rock'
  item_source: string
  source_id: string
  title: string
  preview: string | null
  status: string | null
  due_at: string | null
  priority: number | null
  unread: boolean
  action_required: boolean
  related_entity: string | null
  related_entity_id: string | null
  created_at: string
}
```

---

## Files Summary

| Sprint | File | Action |
|--------|------|--------|
| 1 | SQL Migration | `v_inbox_items` view, `rpc_get_inbox_items`, `rpc_get_or_create_conversation`, update `v_user_notification_summary` |
| 2 | `src/types/inbox.ts` | New shared types |
| 2 | `src/hooks/useClientInbox.ts` | New hook |
| 2 | `src/pages/ClientInboxPage.tsx` | New page |
| 2 | `src/pages/client/ClientInboxWrapper.tsx` | New wrapper |
| 2 | `src/components/client/ClientSidebar.tsx` | Add Inbox nav item |
| 2 | `src/components/client/ClientTopbar.tsx` | Enhanced bell |
| 2 | `src/App.tsx` | Add `/client/inbox` route |
| 3 | `src/hooks/useTeamInbox.ts` | New hook |
| 3 | `src/pages/TeamInboxPage.tsx` | New page |
| 3 | `src/pages/TeamInboxWrapper.tsx` | New wrapper |
| 3 | `src/components/DashboardLayout.tsx` | Add Inbox to Work section |
| 3 | `src/App.tsx` | Add `/inbox` route |
| 4 | `src/components/inbox/InboxItemRow.tsx` | Shared component |
| 4 | `src/components/inbox/InboxFilters.tsx` | Shared component |

## Technical Notes

- `tenants.id` is `bigint` -- all tenant_id references use bigint
- `client_task_instances.id` is `bigint` -- cast to text for `source_id`
- The view uses `security_invoker = true` so existing RLS on each source table governs access
- No new RLS policies needed on the view itself
- The existing `tasks` table (ClickUp import) is left untouched
- Client task status integers map: 0=Not Started, 1=In Progress, 2=Complete, 3=N/A
- All writes use existing mutations (no new write paths through the view)
- `broadcast` type conversations already flow through `tenant_conversations` from Phase 1
