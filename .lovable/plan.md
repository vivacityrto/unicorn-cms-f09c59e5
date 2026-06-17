# Phase 4 — Wire Email Tickets into Team Inbox

## Scope
Create the missing `public.rpc_get_inbox_items` RPC (email-ticket leg only for v1) and extend the Team Inbox UI to render and route `ticket` items.

## Discrepancies found in codebase reads
1. **`InboxFilterType` does NOT include `'notification'`** even though `InboxItem.item_type` does. I'll add `'ticket'` to both unions to stay consistent with the spec.
2. **`useTeamInbox.ts` casts `supabase.rpc` to `any`** — fine, no generated-types issue when the RPC ships.
3. **`tenant_id` typing**: `InboxItem.tenant_id` is `number`, but the column is `bigint`. PostgREST returns bigint as a JS `number` when ≤ 2^53 (safe for our tenant IDs); no cast needed. Leaving the type as `number` is acceptable.
4. **`TeamInboxPage` click handler** has no `else` branch — clicks on `rock`/`notification`/`ticket` are silently ignored today. I'll add the `ticket` branch.
5. **`InboxFilters` `showRock` pattern**: appends a single extra entry. I'll mirror that exactly for `showTickets`.

## 1. Migration — `rpc_get_inbox_items`

```sql
CREATE OR REPLACE FUNCTION public.rpc_get_inbox_items(
  p_user_id         uuid,
  p_limit           integer DEFAULT 100,
  p_offset          integer DEFAULT 0,
  p_item_type       text    DEFAULT NULL,
  p_tenant_id       integer DEFAULT NULL,
  p_action_required boolean DEFAULT NULL
)
RETURNS TABLE (
  inbox_id          uuid,
  tenant_id         bigint,
  user_id           uuid,
  item_type         text,
  item_source       text,
  source_id         text,
  title             text,
  preview           text,
  status            text,
  due_at            timestamptz,
  priority          integer,
  unread            boolean,
  action_required   boolean,
  related_entity    text,
  related_entity_id text,
  created_at        timestamptz,
  updated_at        timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    t.id                                              AS inbox_id,
    t.tenant_id                                       AS tenant_id,
    t.assigned_to_user_id                             AS user_id,
    'ticket'::text                                    AS item_type,
    'email_tickets'::text                             AS item_source,
    t.id::text                                        AS source_id,
    t.subject                                         AS title,
    (COALESCE(t.sender_name,'') || ' <' ||
     COALESCE(t.sender_email,'') || '>')              AS preview,
    t.status                                          AS status,
    t.response_due_at                                 AS due_at,
    CASE WHEN t.urgent THEN 1 ELSE 2 END              AS priority,
    true                                              AS unread,
    (COALESCE(t.urgent,false) OR COALESCE(t.sla_breached,false))
                                                      AS action_required,
    'email_ticket'::text                              AS related_entity,
    t.id::text                                        AS related_entity_id,
    t.received_at                                     AS created_at,
    t.updated_at                                      AS updated_at
  FROM public.email_tickets t
  WHERE t.assigned_to_user_id = p_user_id
    AND t.status IS DISTINCT FROM 'closed'
    AND (p_item_type IS NULL OR p_item_type = 'ticket')
    AND (p_tenant_id IS NULL OR t.tenant_id = p_tenant_id::bigint)
    AND (
      p_action_required IS NULL
      OR p_action_required = false
      OR (COALESCE(t.urgent,false) OR COALESCE(t.sla_breached,false))
    )
  ORDER BY (CASE WHEN t.urgent THEN 1 ELSE 2 END) ASC,
           t.response_due_at ASC NULLS LAST
  LIMIT  GREATEST(p_limit, 0)
  OFFSET GREATEST(p_offset, 0)
$$;

REVOKE ALL ON FUNCTION public.rpc_get_inbox_items(uuid,integer,integer,text,integer,boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_get_inbox_items(uuid,integer,integer,text,integer,boolean) TO authenticated;
```

Notes:
- `SECURITY DEFINER` + `search_path=''` per project standard; all objects fully qualified.
- `p_tenant_id` is `integer` (matches hook), cast to `bigint` for the column compare.
- v1 returns only email tickets; future phases UNION ALL additional legs.

**Lock impact:** `CREATE OR REPLACE FUNCTION` takes a brief catalog lock; no table locks. Safe online.

**Rollback:**
```sql
DROP FUNCTION IF EXISTS public.rpc_get_inbox_items(uuid,integer,integer,text,integer,boolean);
```

**Verification queries (run after migration):**
```sql
-- Smoke: a known assignee should see their open tickets
SELECT * FROM public.rpc_get_inbox_items('<uuid>'::uuid);

-- Filter: type filter excludes non-ticket types
SELECT count(*) FROM public.rpc_get_inbox_items('<uuid>'::uuid, 100, 0, 'task');  -- expect 0

-- Action required only returns urgent/breached
SELECT count(*) FILTER (WHERE NOT action_required)
FROM public.rpc_get_inbox_items('<uuid>'::uuid, 100, 0, NULL, NULL, true);  -- expect 0
```

## 2. Frontend changes

**`src/types/inbox.ts`**
- Add `'ticket'` to `InboxItem.item_type` union.
- Extend `InboxFilterType` to `'all' | 'message' | 'task' | 'announcement' | 'rock' | 'ticket'`.

**`src/components/inbox/InboxFilters.tsx`**
- Add prop `showTickets?: boolean`.
- After the `showRock` append, also append `{ value: 'ticket', label: 'Tickets' }` when `showTickets`.

**`src/components/inbox/InboxItemRow.tsx`**
- Add `ticket` entry to `TYPE_CONFIG`: `{ icon: Mail, label: 'Ticket', className: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200' }` (cyan = primary brand).
- Import `Mail` from `lucide-react`.

**`src/pages/TeamInboxPage.tsx`**
- Add branch to `handleClick`:
  ```ts
  } else if (item.item_type === 'ticket') {
    navigate(`/email-triage?ticket=${item.source_id}`);
  }
  ```
- Pass `showTickets` to `<InboxFilters ... />`.

No hook changes required — `useTeamInbox` already forwards `p_item_type` verbatim.

## 3. Acceptance checks
- Team Inbox loads without RPC error and shows tickets assigned to the current user (open + non-closed).
- "Tickets" filter chip narrows to ticket rows only.
- "Action required" toggle limits to urgent / SLA-breached tickets.
- Clicking a ticket row navigates to `/email-triage?ticket=<id>`.
- A user with no assigned tickets sees the existing empty state (no error toast).

## 4. Out of scope (future phases)
- Other inbox sources (messages, tasks, announcements, rocks, notifications) — left as future UNION legs.
- Deep-link handling on `/email-triage` to auto-open the side panel for `?ticket=<id>` (Phase 5).
- Per-user "read" state for tickets (currently always `unread = true`).
