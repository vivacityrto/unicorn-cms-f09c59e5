
# RLS Standardization: email_message_attachments Table

## Clarification
Your spec references `email_attachments` and `email_records`, but based on the schema:

| Your Spec | Actual Table | Purpose |
|-----------|--------------|---------|
| `email_records` | `email_messages` | Captured Outlook emails |
| `email_attachments` | `email_message_attachments` | Attachments for captured emails |

The existing `email_attachments` table is for **email templates** (linked to `emails`), not user-captured Outlook emails.

---

## Current State: `email_message_attachments`
- **RLS**: Already enabled
- **Existing Policies** (using legacy functions):
  - `email_msg_attachments_select_own` — EXISTS check on parent email ownership
  - `email_msg_attachments_select_superadmin` — `is_super_admin()` (legacy)
  - `email_msg_attachments_insert_own` — EXISTS check on parent email ownership
  - *No UPDATE/DELETE policies*

---

## Planned Changes

### 1. DROP Existing Policies
Remove 3 legacy policies to replace with standardized versions.

### 2. CREATE Standardized Policies

| Operation | Policy Name | Logic |
|-----------|-------------|-------|
| **SELECT** | `email_message_attachments_select` | Own via parent OR SuperAdmin |
| **INSERT** | `email_message_attachments_insert` | Own via parent only |
| **UPDATE** | `email_message_attachments_update` | SuperAdmin only |
| **DELETE** | `email_message_attachments_delete` | SuperAdmin only |

### 3. Policy Definitions

**SELECT** — Owner via parent email or SuperAdmin
```sql
CREATE POLICY "email_message_attachments_select"
ON public.email_message_attachments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.email_messages em
    WHERE em.id = email_message_attachments.email_message_id
      AND em.user_uuid = auth.uid()
  )
  OR public.is_super_admin_safe(auth.uid())
);
```

**INSERT** — Only if user owns parent email
```sql
CREATE POLICY "email_message_attachments_insert"
ON public.email_message_attachments
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.email_messages em
    WHERE em.id = email_message_attachments.email_message_id
      AND em.user_uuid = auth.uid()
  )
);
```

**UPDATE** — SuperAdmin only
```sql
CREATE POLICY "email_message_attachments_update"
ON public.email_message_attachments
FOR UPDATE TO authenticated
USING (public.is_super_admin_safe(auth.uid()))
WITH CHECK (public.is_super_admin_safe(auth.uid()));
```

**DELETE** — SuperAdmin only
```sql
CREATE POLICY "email_message_attachments_delete"
ON public.email_message_attachments
FOR DELETE TO authenticated
USING (public.is_super_admin_safe(auth.uid()));
```

---

## Technical Details

### Parent Table Access
The INSERT and SELECT policies use an `EXISTS` subquery to check ownership of the parent `email_messages` record. This is the standard Pattern 4 (Child Tables) from the security helpers reference.

### Edge Function Compatibility
The `capture-outlook-email` edge function creates attachments using the user's JWT context, so the INSERT policy will correctly enforce that the user owns the parent email message.

---

## Migration Summary
A single migration will:
1. Drop 3 existing legacy policies
2. Create 4 standardized policies using `is_super_admin_safe()`

---

## Also Needed: `email_attachments` (Template Attachments)
The original `email_attachments` table for email templates has a different access pattern:
- Currently: One overly permissive policy checking `emails` table exists
- Should follow Pattern 4 but check `created_by` on parent `emails` table or use staff-only access

Would you like me to include standardization for this table as well?
