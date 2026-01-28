

# Plan: Display Staff Tasks for Phases

## Overview

Add the ability to view and manage staff task instances within each phase (stage) for a client's package. This will extend the existing `PackageStagesManager` component to show tasks associated with each stage instance.

---

## Architecture Summary

The data flows as follows:

```text
tenant (7535)
    └── package_instance (e.g., 15165 for KS-RTO)
            └── stage_instance (e.g., 24756)
                    └── staff_task_instances (e.g., 16 tasks)
                            └── staff_task (template metadata: name, description)
```

**Key Tables:**
- `public.staff_tasks` — Template tasks with `name`, `description`, `stage_id`
- `public.staff_task_instances` — Per-tenant execution records with `status`, `assignee_id`, `due_date`

---

## Implementation Approach

### 1. Create a new hook: `useStaffTaskInstances`

A dedicated hook to fetch and manage staff task instances for a given stage instance.

**Location:** `src/hooks/useStaffTaskInstances.ts`

**Responsibilities:**
- Fetch `staff_task_instances` by `stage_instance_id`
- Join to `staff_tasks` for template metadata (name, description)
- Join to `users` for assignee information
- Provide mutation functions: `updateTaskStatus`, `updateAssignee`
- Include audit logging for compliance

---

### 2. Create a new component: `StageStaffTasks`

A collapsible panel to display staff tasks within a stage.

**Location:** `src/components/client/StageStaffTasks.tsx`

**Features:**
- Expandable within each stage row in `PackageStagesManager`
- Task list with: name, status badge, assignee avatar, due date
- Status dropdown to change task status (not_started, in_progress, completed, na)
- Assignee selector (team members)
- Progress indicator (X/Y tasks complete)

**Status Mapping:**
| status_id | value | Display Label |
|-----------|-------|---------------|
| 0 | not_started | Not Started |
| 1 | in_progress | In Progress |
| 2 | completed | Completed |
| 3 | na | N/A |

---

### 3. Extend `PackageStagesManager` component

Modify the existing component to:
- Add an expand/collapse chevron to each stage row
- When expanded, render `StageStaffTasks` for that stage instance
- Show task count badge on each stage row (e.g., "16 tasks")

---

### 4. Add RLS policy for `staff_task_instances`

Enable Row Level Security on the `staff_task_instances` table to protect task data.

**Policies:**
- **SELECT:** Authenticated users can read instances where they have access to the tenant (via `stage_instances` → `package_instances` → `tenant_id`)
- **UPDATE:** Staff members and SuperAdmins can update task status and assignee

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/hooks/useStaffTaskInstances.ts` | Create | Hook for fetching/updating staff task instances |
| `src/components/client/StageStaffTasks.tsx` | Create | Component to display tasks for a stage |
| `src/components/client/PackageStagesManager.tsx` | Modify | Add expand/collapse and task count per stage |
| `supabase/migrations/*.sql` | Create | RLS policies for staff_task_instances |

---

## Technical Details

### Hook: `useStaffTaskInstances`

```typescript
interface StaffTaskInstance {
  id: number;
  staff_task_id: number;
  task_name: string;
  task_description: string | null;
  status: string; // 'not_started' | 'in_progress' | 'completed' | 'na'
  status_id: number;
  due_date: string | null;
  completion_date: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_avatar: string | null;
}

// Fetch query pattern:
SELECT 
  sti.*,
  st.name as task_name,
  st.description as task_description,
  u.first_name, u.last_name, u.avatar_url
FROM staff_task_instances sti
LEFT JOIN staff_tasks st ON sti.staff_task_id = st.id
LEFT JOIN users u ON sti.assignee_id = u.user_uuid
WHERE sti.stage_instance_id = ?
ORDER BY st.order_number, sti.id
```

### Component: `StageStaffTasks`

- Uses Collapsible pattern from Radix UI (already in project)
- Status badges with consistent colour scheme
- Skeleton loading states
- Audit logging on status changes

### RLS Migration

```sql
ALTER TABLE public.staff_task_instances ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users (tenant-scoped via joins)
CREATE POLICY "Authenticated users can read staff_task_instances"
ON public.staff_task_instances FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.stage_instances si
    JOIN public.package_instances pi ON si.package_instance_id = pi.id
    JOIN public.tenant_users tu ON pi.tenant_id = tu.tenant_id
    WHERE si.id = staff_task_instances.stage_instance_id
    AND tu.user_uuid = auth.uid()
  )
  OR public.is_superadmin()
);

-- Update access for staff/superadmins
CREATE POLICY "Staff can update staff_task_instances"
ON public.staff_task_instances FOR UPDATE TO authenticated
USING (public.is_superadmin() OR public.is_staff())
WITH CHECK (public.is_superadmin() OR public.is_staff());
```

---

## User Experience

1. User navigates to Client Detail → Packages tab
2. Expands a package to see phases
3. Each phase row shows: phase name, status, task count badge
4. Clicking expand on a phase reveals the staff tasks list
5. Each task shows: name, status dropdown, assignee, due date
6. Changing status immediately updates and logs the change

---

## Compliance Considerations

- All status changes are logged to `client_audit_log`
- RLS ensures tenant isolation
- SuperAdmin override for cross-tenant access

