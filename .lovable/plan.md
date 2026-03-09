

## Fix: Primary Contact Not Showing After Adding Users

### Root Cause

The `invite-user` edge function creates `tenant_users` rows with `role: 'parent'` for Admin users but **does not set `primary_contact: true`**. The header and Manage Clients list both filter on `primary_contact = true`, so these contacts are invisible.

**Evidence**: Tenant 7505 has Vanessa Kemper with `role = 'parent'` but `primary_contact = NULL`.

### Changes

**1. Edge function fix** (`supabase/functions/invite-user/index.ts`, line 291-295)

Add `primary_contact: true` when role is `parent`:
```ts
.insert({
  user_id: userUuid,
  tenant_id: payload.tenant_id,
  role: payload.unicorn_role === 'Admin' ? 'parent' : 'child',
  primary_contact: payload.unicorn_role === 'Admin',
})
```

**2. Database trigger** — safety net so any future insert/update that sets `role = 'parent'` automatically sets `primary_contact = true`:
```sql
CREATE OR REPLACE FUNCTION sync_primary_contact_on_role()
RETURNS trigger AS $$
BEGIN
  IF NEW.role = 'parent' AND (NEW.primary_contact IS NULL OR NEW.primary_contact = false) THEN
    NEW.primary_contact := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_primary_contact
  BEFORE INSERT OR UPDATE ON public.tenant_users
  FOR EACH ROW EXECUTE FUNCTION sync_primary_contact_on_role();
```

**3. Backfill existing data** — fix all existing `parent` rows missing the flag:
```sql
UPDATE public.tenant_users
SET primary_contact = true
WHERE role = 'parent' AND (primary_contact IS NULL OR primary_contact = false);
```

### Files Modified
- `supabase/functions/invite-user/index.ts` (add `primary_contact` field)
- New SQL migration (trigger + backfill)

