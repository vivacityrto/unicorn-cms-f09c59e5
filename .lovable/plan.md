

## Fix Unmapped unicorn1.users Records

### Problem
There are **83 active unicorn1.users** with `mapped_user_uuid = NULL`. These are legacy records that were never linked to their corresponding `public.users` records.

### Breakdown

| Category | Count | Action |
|----------|-------|--------|
| Have matching email in public.users | 49 | Update `mapped_user_uuid` on unicorn1.users |
| Already linked in tenant_users | 40 of 49 | No tenant_users change needed |
| Missing from tenant_users | 9 of 49 | Mostly Vivacity internal staff (not client tenants) |
| No match in public.users at all | 29 | Skip for now (would need new user creation) |

### What We Will Do

**Step 1: Update `mapped_user_uuid` on unicorn1.users**

For the 49 records that match by email, set their `mapped_user_uuid` to the corresponding `public.users.user_uuid`:

```sql
UPDATE unicorn1.users u1
SET mapped_user_uuid = pu.user_uuid
FROM public.users pu
WHERE lower(pu.email) = lower(u1.email)
  AND u1.mapped_user_uuid IS NULL
  AND u1."Archived" = false
  AND u1."Disabled" = false;
```

**Step 2: No tenant_users changes needed**

The 9 unlinked records are mostly Vivacity internal staff (e.g., Dave Richards, Sam Holtham, Kelly Xu) whose legacy IDs don't correspond to client tenant IDs. The 40 that matter (client contacts) are already correctly linked in `tenant_users`. No inserts are needed.

### What This Fixes
- The primary contact lookup for the header will now resolve correctly for all tenants that have a `tenant_users` entry with a user whose `mapped_user_uuid` was previously null
- Future data migrations can rely on the `mapped_user_uuid` linkage being complete

### Technical Details
- Only `unicorn1.users` is modified (one column: `mapped_user_uuid`)
- No schema changes required
- No public.users or tenant_users modifications
- The 29 users with no email match in public.users will be left as-is (they may be obsolete or require manual review)

