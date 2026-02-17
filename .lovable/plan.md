

## Fix All Unmapped unicorn1.users Records (Full Scope)

### Problem Found

The previous migration only linked **49 out of 399** client users because it excluded archived/disabled records. The real numbers are:

| Category | Count | Action |
|----------|-------|--------|
| Total unmapped Client users with a tenant | 361 | Need fixing |
| Have matching email in public.users | 331 | Update mapped_user_uuid |
| No email match in public.users | 30 | Create new public.users records first |
| Already mapped (from previous migration) | 38 | Already done |

### Step 1: Map the remaining 331 by email

These users exist in both tables but were skipped by the previous migration (archived/disabled filter). Set their `mapped_user_uuid`:

```sql
UPDATE unicorn1.users u1
SET mapped_user_uuid = pu.user_uuid
FROM public.users pu
WHERE lower(pu.email) = lower(u1.email)
  AND u1.mapped_user_uuid IS NULL
  AND u1."Discriminator" = 'Client'
  AND u1.u2_tenant_id IS NOT NULL;
```

### Step 2: Create public.users records for the 30 with no email match

These 30 users (e.g., Lorenzo Inunciaga, Pamela Trantalles, Hamid Iskeirjeh) have no corresponding record in `public.users`. We need to insert them, mapping fields from the legacy schema:

```sql
INSERT INTO public.users (
  first_name, last_name, email, phone, job_title, 
  archived, disabled, user_type, unicorn_role, role,
  tenant_id, rto_name, abn, acn, website, lms, 
  accounting_system, street_address, suburb, postcode
)
SELECT
  u1."FirstName",
  u1."LastName",
  u1.email,
  u1."Phone",
  u1."JobTitle",
  u1."Archived",
  u1."Disabled",
  'Client Parent'::user_type,
  'Admin'::unicorn_role,
  'Client Parent',
  u1.u2_tenant_id,
  u1."RTO_Name",
  u1."ABN",
  u1."ACN",
  u1."Website",
  u1."LMS",
  u1."Accounting_System",
  u1."Address",
  u1."Suburb",
  u1."Postcode"
FROM unicorn1.users u1
WHERE u1."Discriminator" = 'Client'
  AND u1.mapped_user_uuid IS NULL
  AND u1.u2_tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.users pu 
    WHERE lower(pu.email) = lower(u1.email)
  );
```

### Step 3: Map the newly created 30

After Step 2, these 30 now have matching emails. Run the same mapping query again:

```sql
UPDATE unicorn1.users u1
SET mapped_user_uuid = pu.user_uuid
FROM public.users pu
WHERE lower(pu.email) = lower(u1.email)
  AND u1.mapped_user_uuid IS NULL
  AND u1."Discriminator" = 'Client'
  AND u1.u2_tenant_id IS NOT NULL;
```

### Step 4: Sync archived/disabled status

Ensure `public.users` reflects the legacy archived/disabled flags for all mapped client users:

```sql
UPDATE public.users pu
SET 
  archived = u1."Archived",
  disabled = u1."Disabled",
  updated_at = now()
FROM unicorn1.users u1
WHERE pu.user_uuid = u1.mapped_user_uuid
  AND u1."Discriminator" = 'Client'
  AND (pu.archived != u1."Archived" OR pu.disabled != u1."Disabled");
```

### Step 5: Insert missing tenant_users records

For all Client users that now have both `mapped_user_uuid` and `u2_tenant_id` but are missing from `tenant_users`:

```sql
INSERT INTO tenant_users (tenant_id, user_id, role, primary_contact)
SELECT 
  u1.u2_tenant_id,
  u1.mapped_user_uuid,
  'parent',
  true
FROM unicorn1.users u1
WHERE u1.mapped_user_uuid IS NOT NULL
  AND u1.u2_tenant_id IS NOT NULL
  AND u1."Discriminator" = 'Client'
  AND NOT EXISTS (
    SELECT 1 FROM tenant_users tu 
    WHERE tu.user_id = u1.mapped_user_uuid 
      AND tu.tenant_id = u1.u2_tenant_id
  )
ON CONFLICT DO NOTHING;
```

### What This Fixes

- All ~399 legacy client users will be linked between unicorn1.users and public.users
- All tenants with a legacy client contact will have at least one tenant_user with primary_contact = true
- The archived/disabled status in public.users will match the legacy source of truth
- The Client Detail header will show the correct primary contact for all tenants

### What This Does NOT Fix

- 25 tenants created directly in Unicorn 2.0 (no legacy data) still need users added manually
- One test user (ID 7517, "test test") and one odd record (ID 7533, "Male Female") will be included but may need manual cleanup later

### Technical Details

- All operations are data-only (no schema changes)
- Uses `ON CONFLICT DO NOTHING` for safety on inserts
- Steps must be executed in order (1 through 5)
- All operations are idempotent and safe to re-run
- New public.users records default to `user_type = 'Client Parent'` and `unicorn_role = 'Admin'` to match the existing pattern for primary client contacts

