
# RLS Standardization: meeting_participants Table

## Current State
- **Table**: `public.meeting_participants`
- **RLS**: Already enabled
- **Existing Policies** (4 total, using legacy patterns):

| Policy Name | Operation | Logic |
|-------------|-----------|-------|
| `Users can view participants of own meetings` | SELECT | EXISTS check on parent meeting ownership |
| `Users can view participants of shared meetings with details` | SELECT | EXISTS check with `cs.scope = 'details'` |
| `Users can insert participants to own meetings` | INSERT | EXISTS check on parent meeting ownership |
| `Users can delete participants from own meetings` | DELETE | EXISTS check on parent meeting ownership |

**Missing**: No SuperAdmin access, no UPDATE policy, SELECT scope restriction differs from spec.

---

## Schema Discovery

### meeting_participants columns:
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, auto-generated |
| `meeting_id` | uuid | FK to meetings |
| `participant_email` | text | Required |
| `participant_name` | text | Nullable |
| `participant_type` | text | Default 'required' |
| `attended` | boolean | Nullable |
| `created_at` | timestamptz | Auto-generated |

---

## Planned Changes

### 1. DROP Existing Policies
Remove 4 legacy policies to replace with standardized versions.

### 2. CREATE Standardized Policies

| Operation | Policy Name | Logic |
|-----------|-------------|-------|
| **SELECT** | `meeting_participants_select` | Access via parent meeting OR SuperAdmin |
| **INSERT** | `meeting_participants_insert` | Meeting owner only |
| **UPDATE** | `meeting_participants_update` | Meeting owner OR SuperAdmin |
| **DELETE** | `meeting_participants_delete` | Meeting owner OR SuperAdmin |

### 3. Policy Definitions

**SELECT** — Via parent meeting access (owner, shared viewer) or SuperAdmin
```sql
CREATE POLICY "meeting_participants_select"
ON public.meeting_participants
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = meeting_participants.meeting_id
      AND (
        m.owner_user_uuid = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.calendar_shares cs
          WHERE cs.owner_user_uuid = m.owner_user_uuid
            AND cs.viewer_user_uuid = auth.uid()
        )
      )
  )
  OR public.is_super_admin_safe(auth.uid())
);
```

**INSERT** — Meeting owner only
```sql
CREATE POLICY "meeting_participants_insert"
ON public.meeting_participants
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = meeting_participants.meeting_id
      AND m.owner_user_uuid = auth.uid()
  )
);
```

**UPDATE** — Meeting owner or SuperAdmin
```sql
CREATE POLICY "meeting_participants_update"
ON public.meeting_participants
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = meeting_participants.meeting_id
      AND m.owner_user_uuid = auth.uid()
  )
  OR public.is_super_admin_safe(auth.uid())
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = meeting_participants.meeting_id
      AND m.owner_user_uuid = auth.uid()
  )
  OR public.is_super_admin_safe(auth.uid())
);
```

**DELETE** — Meeting owner or SuperAdmin
```sql
CREATE POLICY "meeting_participants_delete"
ON public.meeting_participants
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = meeting_participants.meeting_id
      AND m.owner_user_uuid = auth.uid()
  )
  OR public.is_super_admin_safe(auth.uid())
);
```

---

## Technical Details

### Parent Table Access Pattern
All policies use `EXISTS` subqueries to check access through the parent `meetings` table. This is Pattern 4 (Child Tables) from the security helpers.

### Scope Restriction Removed
The current SELECT policy for shared meetings restricts to `cs.scope = 'details'`. Your spec removes this restriction, allowing any shared viewer to see participants (not just those with `details` scope). This aligns with the general meeting sharing model.

### SuperAdmin Access Added
All operations now include SuperAdmin access via `is_super_admin_safe()`, which was missing from all existing policies.

### UPDATE Policy Added
Previously missing - now meeting owners and SuperAdmins can update participant records (e.g., mark attendance).

---

## Migration Summary
A single migration will:
1. Drop 4 existing legacy policies
2. Create 4 standardized policies using `is_super_admin_safe()`

---

## Impact Assessment
- **SuperAdmin access added** — Was missing from all operations
- **UPDATE policy added** — Previously missing (meeting owner or SuperAdmin)
- **Shared viewer access simplified** — Removed `scope = 'details'` restriction
- **No code changes needed** — RLS is transparent to the frontend
