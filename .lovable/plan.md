
# Task-to-Tenant Mapping Table

## Context

- The **`tasks`** table stores ClickUp-synced data with hierarchy fields: `space_name`, `folder_name_path`, `list_name` -- but no `tenant_id`.
- The **`tasks_tenants`** table is the operational task table with `tenant_id` and a `source_task_id` FK pointing back to `tasks`.
- Currently empty (0 rows in `tasks`), but when ClickUp sync populates it, we need automatic tenant resolution.

## Design

Create a **`clickup_tenant_mapping`** table that maps ClickUp hierarchy patterns to tenants. When tasks sync in, the system matches `space_name` / `folder_name_path` / `list_name` against these patterns to resolve the `tenant_id`.

```text
clickup_tenant_mapping
-----------------------
id              bigint (PK, generated)
tenant_id       bigint (FK -> tenants.id, NOT NULL)
match_field     text   ('space_name' | 'folder_name_path' | 'list_name')
match_pattern   text   (the value to match, e.g. "Acme Training/Compliance")
priority        int    (higher = checked first, default 0)
is_active       boolean (default true)
created_by      uuid   (FK -> users.user_uuid)
created_at      timestamptz
updated_at      timestamptz
UNIQUE(match_field, match_pattern)
```

## Implementation Steps

### 1. Migration -- Create mapping table

- Create `clickup_tenant_mapping` with columns above
- Add FK to `tenants(id)` with `ON DELETE CASCADE`
- Add unique constraint on `(match_field, match_pattern)` to prevent duplicates
- Add check constraint on `match_field` for allowed values
- Enable RLS: Vivacity staff only (read/write)

### 2. Migration -- Create resolver function

Create `resolve_tenant_for_task(p_task_id uuid)` that:
- Reads the task's `space_name`, `folder_name_path`, `list_name`
- Matches against `clickup_tenant_mapping` rows ordered by `priority DESC`
- Returns the first matching `tenant_id` or NULL

### 3. Migration -- Create bulk resolver view

Create `v_tasks_unmapped` view showing tasks from the `tasks` table that have no corresponding `tasks_tenants` row (via `source_task_id`), with suggested tenant matches from the mapping table.

### 4. Frontend -- Admin mapping management UI

Add a simple management section (SuperAdmin only) to:
- List current mappings (tenant name, field, pattern)
- Add new mapping (select tenant, choose field, enter pattern)
- Deactivate/delete mappings

This can be a section within the existing admin/settings area.

### 5. RLS Policies

```sql
-- Staff can read and manage mappings
CREATE POLICY clickup_tenant_mapping_select
  ON clickup_tenant_mapping FOR SELECT TO authenticated
  USING (is_vivacity_staff(auth.uid()));

CREATE POLICY clickup_tenant_mapping_modify
  ON clickup_tenant_mapping FOR ALL TO authenticated
  USING (is_vivacity_staff(auth.uid()))
  WITH CHECK (is_vivacity_staff(auth.uid()));
```

## Technical Notes

- Pattern matching uses exact string match initially (not regex) for simplicity and auditability. Can be extended to ILIKE or regex later.
- The `priority` field allows overlapping patterns (e.g., a space-level catch-all at priority 0 and a folder-level override at priority 10).
- The resolver function is callable from sync edge functions or manually from an admin "Map Unmapped Tasks" action.
- No changes to the existing `tasks` or `tasks_tenants` tables are required.
