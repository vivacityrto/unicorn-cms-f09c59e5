

## Client Portal Enhancement Plan

This is a large scope request covering 7 areas. Following the stated priority order and building on what already exists in the codebase.

---

### Phase 1: Tasks Tab + Unified Task Query (Priority 1)

**What exists:** `client_task_instances` table with `stageinstance_id`, `status`, `due_date`, `completion_date`. Tasks are currently only accessible buried inside Package > Stage > Client Tasks.

**New sidebar item:** Add "Tasks" between Home and Documents in `clientMenuItems`.

**New page: `/client/tasks`**
- Fetches all `client_task_instances` for the active tenant across all packages/stages
- Joins through `stage_instances` -> `package_instances` -> `packages` and `client_tasks` (for name) and `stages` (for stage name)
- Columns: Task Name, Package, Stage, Due Date, Status, Overdue indicator
- Filters: All | Overdue | Due Soon (next 7 days) | Completed
- Sorted by due date ascending (overdue first)

**Files:**
| File | Change |
|------|--------|
| `src/components/client/ClientSidebar.tsx` | Add Tasks item (CheckSquare icon) after Home |
| `src/pages/client/ClientTasksWrapper.tsx` | New wrapper with ClientLayout |
| `src/pages/ClientTasksPage.tsx` | New page component with table, filters |
| `src/hooks/useClientAllTasks.ts` | New hook querying tasks across all packages |
| `src/App.tsx` | Add `/client/tasks` route |

---

### Phase 2: Notification Badge Logic (Priority 2)

**What exists:** `useNotifications` hook queries `notification_tenants` table. `useClientNotifications` queries `user_notifications`. The topbar bell already shows unread count with a pink badge and animation.

**Current behaviour is already close to the requirement.** The bell icon already turns coloured (pink) when unread count > 0, with a pulsing badge. The main gap is that notifications are only created manually in a few places.

**Changes:**
- No schema change needed -- `user_notifications` table already supports types
- Update the bell in `ClientTopbar.tsx` to use `useClientNotifications` (user-scoped) instead of `useNotifications` (tenant-scoped) for more accurate per-user unread counts
- Add a solid red dot indicator (in addition to the count badge) when action-required types exist

**Files:**
| File | Change |
|------|--------|
| `src/components/client/ClientTopbar.tsx` | Switch to `useClientNotifications`, add red dot for action types |

---

### Phase 3: Communications Tab (Priority 3)

**What exists:** A `messages` table with `id`, `conversation_id`, `sender_id`, `body`, `created_at`, `is_read`. This is a good foundation.

**New sidebar item:** Add "Communications" (MessageSquare icon) after Notifications.

**New page: `/client/communications`**
- Threaded view grouped by `conversation_id`
- Shows messages between client and Vivacity team
- Filter by read/unread
- Mark as read on open
- Tenant-scoped via RLS

**Note:** The existing `messages` table lacks `tenant_id` and `recipient_role`. A migration will add these columns to support tenant scoping and role-based filtering.

**Files:**
| File | Change |
|------|--------|
| Migration | Add `tenant_id`, `related_entity`, `related_entity_id` to `messages` table |
| `src/components/client/ClientSidebar.tsx` | Add Communications item |
| `src/pages/client/ClientCommunicationsWrapper.tsx` | New wrapper |
| `src/pages/ClientCommunicationsPage.tsx` | New page with threaded message view |
| `src/hooks/useClientCommunications.ts` | New hook for fetching conversations |
| `src/App.tsx` | Add `/client/communications` route |

---

### Phase 4: Tenant Logo in Topbar (Priority 4)

**What exists:** `tenants.logo_path` column, `client-logos` Supabase storage bucket, `TenantLogoUpload` component. The `ClientTenantContext` only exposes `activeTenantId` and `tenantName`.

**Changes:**
- Extend `ClientTenantContext` to also fetch and expose `logoUrl` from the tenant's `logo_path`
- Display the logo in `ClientTopbar.tsx` to the left of the avatar, using the existing `client-logos` storage bucket for the public URL
- Fallback to a default placeholder or hide if no logo

**Files:**
| File | Change |
|------|--------|
| `src/contexts/ClientTenantContext.tsx` | Fetch tenant `logo_path`, expose `logoUrl` |
| `src/components/client/ClientTopbar.tsx` | Render tenant logo next to avatar |

No schema change needed -- `logo_path` already exists on `tenants`.

---

### Phase 5: Dashboard Intelligence Widgets (Priority 5)

Enhance `ClientHomePage` with smart panels replacing the generic welcome.

**5A. "What Needs Attention" Panel**
- Replace the static "Upcoming reminders" and "Unread notifications" cards
- Show: overdue tasks count, documents awaiting upload, unread messages
- Data sourced from the new `useClientAllTasks` hook and `useClientNotifications`

**5B. Global Progress Indicator**
- Already partially exists via `ClientProgressSummary` and `useClientProgress`
- Add a compact summary widget: Audit Readiness %, Tasks Outstanding, Documents Pending

**Files:**
| File | Change |
|------|--------|
| `src/components/client/ClientHomePage.tsx` | Replace static cards with attention panel and progress widget |
| `src/components/client/AttentionPanel.tsx` | New component showing actionable items |

---

### Phase 6: Activity Timeline (Priority 6)

**New component on the home page** pulling from `client_audit_log` for the active tenant.

- Shows recent: task completions, document uploads, stage releases, consultation logs
- Limited to last 10 items
- Each item shows icon, description, timestamp

**Files:**
| File | Change |
|------|--------|
| `src/components/client/ActivityTimeline.tsx` | New component |
| `src/components/client/ClientHomePage.tsx` | Add timeline section |
| `src/hooks/useClientActivityTimeline.ts` | New hook querying `client_audit_log` |

---

### Phase 7: Document Acknowledgement Tracking

**New table:** `document_acknowledgements`

```text
document_acknowledgements
- id (uuid, PK)
- document_instance_id (bigint, FK)
- tenant_id (integer)
- user_id (uuid)
- acknowledged_at (timestamptz)
```

When a policy document is shared to the portal, clients must acknowledge it. Captures timestamp + user_id for Standards evidence.

**Files:**
| File | Change |
|------|--------|
| Migration | Create `document_acknowledgements` table with RLS |
| Portal document view | Add acknowledge button + tracking |

---

### Architectural Guardrails (Enforced Throughout)

- No role logic in frontend only -- RBAC via `useRBAC` and RLS
- RLS on all new/modified tables
- Notifications created server-side (existing pattern via `user_notifications` inserts)
- No service role in browser
- Tenant isolation on all queries

---

### Summary: Total New Files

| Priority | Feature | New Files | Modified Files |
|----------|---------|-----------|----------------|
| 1 | Tasks Tab | 3 | 2 |
| 2 | Notification Badge | 0 | 1 |
| 3 | Communications Tab | 3 | 2 + migration |
| 4 | Tenant Logo | 0 | 2 |
| 5 | Dashboard Widgets | 1 | 1 |
| 6 | Activity Timeline | 2 | 1 |
| 7 | Doc Acknowledgement | 1 | 1 + migration |

Recommended implementation: tackle Phases 1-4 first as one sprint, then 5-7 as a follow-up.

