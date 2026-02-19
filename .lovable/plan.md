
## Schema Cleanup: `public.users` — Revised Instructions

### Summary of Your Instructions

| Column | Your Instruction |
|---|---|
| `title` | **Keep** — stores Mr/Mrs/Miss honorifics |
| `phone` | **Drop** — its 1 row moved to `mobile_phone` first (it was actually a mobile number) |
| `phone_number` | **Keep** — 35 rows, this is the real phone field |
| `mobile_phone` | **Keep** — leave as-is |
| `is_team` | **Keep** — but update `user_type` to `Vivacity Team` for those 30 rows where `is_team = true` (currently all show `Client Child`, which is wrong) |
| `profile_photo` | **Change type** from `boolean` to `text` so it can store an image file path/URL |
| `avatar_url` | **Keep** — separate concept, leave alone |
| `head_office_address` | **Drop** — tenant field |
| `notes` | **Drop** — tenant field |
| `TS` | **Drop** |
| `biography` | **Merge into `bio` then drop** |
| `linkedin` | **Merge into `linkedin_url` then drop** |
| `last_new_client_tasks_email` | **Drop** — no code references in `src/` |
| `manager_id` (bigint) | **Drop** — old numeric FK, replaced by `manager_uuid` (UUID). The `manager_id` on other tables like `package_instances` is a different column with a UUID type — not affected |

### Confirming the `is_team` Situation

All 30 rows where `is_team = true` currently have `user_type = Client Child` and `unicorn_role = User`. These users have no `tenant_id`, which matches Vivacity internal team members. The migration will update them to `user_type = Vivacity Team` since that is the correct enum value (confirmed from your existing data: `Vivacity Team`, `Client Parent`, `Client Child`).

### Confirming `profile_photo`

Currently a boolean (`false` = 403 rows, `true` = 22 rows, null = 33 rows). Changing to `text` so it can store a storage path or public URL — similar to `avatar_url`. The 22 rows with `true` will become `NULL` as there is no URL to preserve (the boolean only indicated whether a photo existed, not where it was). The 403 false rows also become `NULL`.

---

## Migration Operations

### Phase A — Data Migrations (run before any drops)

```sql
-- 1. Move the 1 phone row into mobile_phone where mobile_phone is null
UPDATE public.users
SET mobile_phone = phone
WHERE mobile_phone IS NULL AND phone IS NOT NULL;

-- 2. Merge biography into bio where bio is null
UPDATE public.users
SET bio = biography
WHERE bio IS NULL AND biography IS NOT NULL;

-- 3. Merge linkedin into linkedin_url where linkedin_url is null
UPDATE public.users
SET linkedin_url = linkedin
WHERE linkedin_url IS NULL AND linkedin IS NOT NULL;

-- 4. Update user_type for is_team=true rows
UPDATE public.users
SET user_type = 'Vivacity Team'
WHERE is_team = true AND user_type = 'Client Child';
```

### Phase B — Schema Changes

```sql
-- Change profile_photo from boolean to text
ALTER TABLE public.users
  ALTER COLUMN profile_photo DROP DEFAULT,
  ALTER COLUMN profile_photo TYPE text USING NULL;

-- Drop all confirmed columns
ALTER TABLE public.users
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS head_office_address,
  DROP COLUMN IF EXISTS notes,
  DROP COLUMN IF EXISTS "TS",
  DROP COLUMN IF EXISTS biography,
  DROP COLUMN IF EXISTS linkedin,
  DROP COLUMN IF EXISTS last_new_client_tasks_email,
  DROP COLUMN IF EXISTS manager_id,
  -- Also drop the previously agreed empty org-level columns
  DROP COLUMN IF EXISTS rto_name,
  DROP COLUMN IF EXISTS email_address,
  DROP COLUMN IF EXISTS street_number_and_name,
  DROP COLUMN IF EXISTS suburb,
  DROP COLUMN IF EXISTS postcode,
  DROP COLUMN IF EXISTS acn,
  DROP COLUMN IF EXISTS abn,
  DROP COLUMN IF EXISTS website,
  DROP COLUMN IF EXISTS lms,
  DROP COLUMN IF EXISTS accounting_system,
  DROP COLUMN IF EXISTS training_facility_address,
  DROP COLUMN IF EXISTS po_box_address,
  DROP COLUMN IF EXISTS legal_name,
  DROP COLUMN IF EXISTS keap_url,
  DROP COLUMN IF EXISTS clickup_url,
  DROP COLUMN IF EXISTS accountable_person,
  DROP COLUMN IF EXISTS street_address,
  DROP COLUMN IF EXISTS po_box,
  DROP COLUMN IF EXISTS rto_id,
  DROP COLUMN IF EXISTS cricos_id,
  DROP COLUMN IF EXISTS registration_end_date;
```

---

## Code Changes Required

### `src/pages/TenantDetail.tsx`

This file reads many of the dropped columns from the `users` table. The contact card section maps fields like `head_office_address`, `rto_id`, `abn`, `acn`, `street_number_and_name`, `suburb`, `postcode`, `lms`, `accounting_system`, `training_facility_address`, `po_box_address`, `cricos_id`, `keap_url`, `clickup_url`, `accountable_person`, `registration_end_date`, `rto_name`, `email_address` (line ~323–353). Since all these columns had no data anyway (all returned empty strings), their removal from the mapping just means those fields in the `ClientData` interface return `""` as a constant rather than reading from the database. The `select("*")` call picks these up automatically — after the columns are dropped they simply won't be in the response. The `ClientData` interface fields themselves can stay as-is (they'll just always be empty), so no code change is strictly required here. However, `phone: userData.phone` needs to change to `phone: userData.mobile_phone || ""` since `phone` is being dropped.

### `src/pages/TeamSettings.tsx`

Line 105 selects `mobile_phone, rto_name, email, abn, acn, website, lms, accounting_system, street_address, state, legal_name` from `users`. After the migration, `rto_name`, `abn`, `acn`, `website`, `lms`, `accounting_system`, `legal_name` no longer exist. The select needs to be trimmed to only include remaining columns: `mobile_phone, email, street_address, state`.

### `src/hooks/useClientActingUser.ts`

Line ~94 selects `phone, mobile_phone` from `users`. After the migration `phone` no longer exists — remove it from the select. The `ActingUserProfile` interface has a `phone` field — this should be renamed to `mobile_phone` or removed since `phone_number` is now the landline and `mobile_phone` is the mobile.

---

## What Is NOT Changing

- `phone_number` — kept as-is (35 rows, your real phone field)
- `mobile_phone` — kept as-is
- `title` — kept (honorifics)
- `is_team` — kept (data updated to correct `user_type`)
- `avatar_url` — unchanged
- `tenant_name` — kept for audit purposes (per earlier instruction)
- `notes` on other tables (EOS, time logs, etc.) — those are different columns on different tables, not affected
- `manager_id` on `package_instances` and `memberships` tables — different tables, UUID type, not touched
- All `tenants` table columns — deferred as previously agreed

---

## Files Changed

1. **Database migration** — data merges + column drops + `profile_photo` type change + `user_type` update for `is_team=true` rows
2. **`src/pages/TenantDetail.tsx`** — change `userData.phone` to `userData.mobile_phone` on line ~328
3. **`src/pages/TeamSettings.tsx`** — remove dropped columns from the select query on line ~105
4. **`src/hooks/useClientActingUser.ts`** — remove `phone` from the select query
