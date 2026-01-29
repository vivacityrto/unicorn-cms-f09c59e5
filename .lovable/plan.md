

## Update Client Task Queries to Use client_task_instances Table

### Overview

Update `useClientPackageInstances` hook to query `client_task_instances` (the instance table) instead of `client_tasks` (the template table), following the same pattern established in `useStaffTaskInstances`. Status mapping will use the `dd_status` table values.

### Database Schema Reference

**client_task_instances** (instance table - 22,444 records):
| Column | Type | Description |
|--------|------|-------------|
| id | bigint | Primary key |
| clienttask_id | integer | FK to client_tasks template |
| stageinstance_id | bigint | FK to stage_instances |
| status | integer | Status code (0, 2 found in data) |
| due_date | timestamptz | Task due date |
| completion_date | timestamptz | When completed |

**client_tasks** (template table - 227 records):
| Column | Type | Description |
|--------|------|-------------|
| id | integer | Primary key |
| stage_id | integer | FK to stages |
| name | text | Task name |
| description | text | Description |
| instructions | text | Instructions |
| sort_order | integer | Display order |

**dd_status** (status lookup):
| Code | Value | Description |
|------|-------|-------------|
| 0 | not_started | Not Started |
| 1 | in_progress | In Progress |
| 2 | completed | Completed |
| 3 | na | N/A |

---

### Technical Changes

#### 1. Update ClientTask Interface (lines 65-75)

**Before:**
```typescript
export interface ClientTask {
  id: string;
  client_package_stage_id: string;
  template_task_id: string | null;
  name: string;
  instructions: string | null;
  due_date: string | null;
  sort_order: number;
  status: 'open' | 'submitted' | 'done';
  created_at: string;
}
```

**After:**
```typescript
export interface ClientTask {
  id: number;
  client_task_id: number | null;
  stage_instance_id: number;
  name: string;
  description: string | null;
  instructions: string | null;
  due_date: string | null;
  completion_date: string | null;
  sort_order: number;
  status: number;
  status_label: string;
  created_at: string;
}
```

#### 2. Add Status Constants

Add at top of file (matching dd_status and useStaffTaskInstances pattern):

```typescript
export const CLIENT_TASK_STATUS_OPTIONS = [
  { value: 0, label: 'Not Started', key: 'not_started' },
  { value: 1, label: 'In Progress', key: 'in_progress' },
  { value: 2, label: 'Completed', key: 'completed' },
  { value: 3, label: 'N/A', key: 'na' },
] as const;
```

#### 3. Update fetchPackageStages Function (lines 246-256)

**Before:** Queries non-existent `client_tasks.client_package_stage_id`

**After:** Query `client_task_instances` via `stageinstance_id`, then batch fetch template metadata from `client_tasks`:

```typescript
// Query client_task_instances for this stage_instance
const { data: clientTaskInstances } = await supabase
  .from('client_task_instances')
  .select('id, clienttask_id, stageinstance_id, status, due_date, completion_date, created_at')
  .eq('stageinstance_id', stage.id);

// Get unique client_task_ids for template lookup
const clientTaskIds = [...new Set(
  (clientTaskInstances || [])
    .map(t => t.clienttask_id)
    .filter(Boolean)
)] as number[];

// Batch fetch template metadata
const { data: clientTaskTemplates } = clientTaskIds.length > 0
  ? await supabase
      .from('client_tasks')
      .select('id, name, description, instructions, sort_order')
      .in('id', clientTaskIds)
  : { data: [] };

// Build lookup map and transform
const templateMap = new Map(
  (clientTaskTemplates || []).map(t => [t.id, t])
);

const transformedClientTasks = (clientTaskInstances || []).map(inst => {
  const template = inst.clienttask_id ? templateMap.get(inst.clienttask_id) : null;
  const statusOption = CLIENT_TASK_STATUS_OPTIONS.find(s => s.value === inst.status);
  return {
    id: inst.id,
    client_task_id: inst.clienttask_id,
    stage_instance_id: inst.stageinstance_id,
    name: template?.name || `Task ${inst.id}`,
    description: template?.description || null,
    instructions: template?.instructions || null,
    due_date: inst.due_date,
    completion_date: inst.completion_date,
    sort_order: template?.sort_order ?? 0,
    status: inst.status,
    status_label: statusOption?.label || 'Unknown',
    created_at: inst.created_at,
  };
}).sort((a, b) => a.sort_order - b.sort_order);
```

#### 4. Update updateClientTaskStatus Function (lines 339-359)

**Before:** Updates `client_tasks` table with string status

**After:** Updates `client_task_instances` table with integer status code:

```typescript
const updateClientTaskStatus = useCallback(async (
  taskId: number,
  newStatus: number
) => {
  try {
    const updateData: Record<string, any> = { status: newStatus };
    
    // Set completion_date if completing
    if (newStatus === 2) {
      updateData.completion_date = new Date().toISOString();
    } else {
      updateData.completion_date = null;
    }

    const { error } = await supabase
      .from('client_task_instances')
      .update(updateData)
      .eq('id', taskId);

    if (error) throw error;
    return true;
  } catch (error: any) {
    toast({
      title: 'Error',
      description: error.message || 'Failed to update task status',
      variant: 'destructive'
    });
    return false;
  }
}, [toast]);
```

---

### Summary of Changes

| File | Section | Change |
|------|---------|--------|
| `useClientPackageInstances.tsx` | Line 65-75 | Update `ClientTask` interface to match `client_task_instances` schema |
| `useClientPackageInstances.tsx` | After imports | Add `CLIENT_TASK_STATUS_OPTIONS` constant |
| `useClientPackageInstances.tsx` | Lines 246-256 | Query `client_task_instances` with template join via batch lookup |
| `useClientPackageInstances.tsx` | Lines 339-359 | Update `updateClientTaskStatus` to use integer status and target correct table |

### Pattern Alignment

This follows the established pattern from `useStaffTaskInstances`:
- Query instance table first
- Batch fetch template metadata
- Build lookup map for transformation
- Use integer status codes from `dd_status`
- Set `completion_date` when status changes to 2 (Completed)

