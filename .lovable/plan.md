## Plan: Split `person_name` into `first_name` + `last_name`

### 1. Migration (staff_engagements)
```sql
ALTER TABLE public.staff_engagements
  ADD COLUMN first_name text NOT NULL DEFAULT '',
  ADD COLUMN last_name text NOT NULL DEFAULT '';

ALTER TABLE public.staff_engagements DROP COLUMN person_name;

ALTER TABLE public.staff_engagements
  ALTER COLUMN first_name DROP DEFAULT,
  ALTER COLUMN last_name DROP DEFAULT;
```

### 2. `src/pages/admin/StaffEngagements.tsx`
- Replace single "Full Name" form field with "First Name" + "Last Name" (both required).
- Update insert payload to send `first_name` / `last_name` instead of `person_name`.
- Update table display: render `${row.first_name} ${row.last_name}` where `person_name` was shown.

### 3. `src/pages/admin/StaffEngagementDetail.tsx`
- `Engagement` type: replace `person_name: string` with `first_name: string; last_name: string`.
- Replace all `engagement.person_name` displays with `` `${engagement.first_name} ${engagement.last_name}` ``.
- In `inviteMutation.mutationFn`, set body to:
  ```ts
  body: {
    email: engagement.person_email,
    unicorn_role: inviteAsRole,
    first_name: engagement.first_name,
    last_name: engagement.last_name,
    invite_as: 'VIVACITY',
    tenant_id: 6372,
  }
  ```

### Out of scope
Checklist logic, sign-off panel, other mutations, other files.

### Note
Dropping `person_name` is destructive — any existing rows will lose that value. New `first_name`/`last_name` on existing rows will be empty strings briefly during the ADD step before the NOT NULL DEFAULT is dropped (acceptable per spec).
