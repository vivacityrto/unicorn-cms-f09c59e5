# Invite User Diagnostics Guide

## Error Handling Overview

The Invite User feature now provides detailed error messages from the Edge Function to help diagnose issues quickly.

## Common Error Codes

| Error Code | Meaning | Resolution |
|------------|---------|------------|
| `INVALID_EMAIL` | Email format is invalid | Check email address format |
| `INVALID_TENANT_ID` | Tenant ID is not a valid number | Verify tenant selection |
| `ROLE_NOT_ALLOWED` | Selected role not valid for tenant | Vivacity roles only for tenant 319, Client roles for others |
| `TENANT_NOT_FOUND` | Tenant doesn't exist in database | Verify tenant ID exists in tenants table |
| `AUTH_INVITE_FAILED` | Supabase Auth invitation failed | Check SMTP configuration or user may already exist |
| `PROFILE_UPSERT_FAILED` | Failed to create user profile | Check users table constraints |
| `TENANT_MEMBER_UPSERT_FAILED` | Failed to add user to tenant | Check tenant_members table constraints |
| `AUTH_USER_ID_MISSING` | No auth user ID after invite | Rare error, check Edge Function logs |

## Verification Checklist

### 1. Tenant Configuration
✅ **Vivacity tenant (ID 319) exists**
- Query: `SELECT id, name FROM public.tenants WHERE id = 319;`
- Expected: One row with name "Vivacity Coaching & Consulting"

### 2. Enum Values
✅ **tenant_member_role enum matches expected values**
- Values: `SUPER_ADMIN_ADMINISTRATOR`, `SUPER_ADMIN_TEAM_LEADER`, `SUPER_ADMIN_GENERAL`, `CLIENT_ADMIN`, `CLIENT_USER`
- Query: `SELECT unnest(enum_range(null::tenant_member_role));`

### 3. Table Structure
✅ **tenant_members table has required columns**
- Columns: `user_id` (uuid, NOT NULL), `tenant_id` (bigint), `role` (tenant_member_role, NOT NULL)
- Should have unique constraint or index on (user_id, tenant_id)

✅ **users table has required columns**
- Columns: `user_uuid` (uuid, NOT NULL), `email` (text, NOT NULL), `tenant_id` (bigint), `unicorn_role`, `user_type`

## Diagnostics Steps

### If Invite Fails with Generic Error

1. **Check Edge Function Logs**
   - Go to: Supabase Dashboard → Edge Functions → invite-user → Logs
   - Look for entries with `code` and `detail` fields
   - Check timestamp matches your invite attempt

2. **Verify SMTP Configuration**
   - Go to: Supabase Dashboard → Project Settings → Auth → SMTP Settings
   - Ensure SMTP credentials are configured
   - Test with a simple auth email first

3. **Check for Existing User**
   - Query: `SELECT id, email FROM auth.users WHERE email = 'user@example.com';`
   - If user exists, the function will add them to tenant without re-inviting

4. **Verify Role Permissions**
   - Vivacity roles (SUPER_ADMIN_*) are only for tenant ID 319
   - Client roles (CLIENT_*) are for all other tenants
   - Edge Function validates this server-side

### Testing the Invite Flow

1. **Test with Vivacity Tenant (319)**
   ```json
   {
     "email": "test@vivacity.com.au",
     "tenant_id": 319,
     "role": "SUPER_ADMIN_GENERAL"
   }
   ```

2. **Test with Client Tenant**
   ```json
   {
     "email": "client@example.com",
     "tenant_id": 123,
     "role": "CLIENT_USER"
   }
   ```

## Security Notes

- ⚠️ Only Super Admins can invite users
- ⚠️ Never expose SMTP credentials in logs
- ⚠️ Do not test with production email addresses
- ⚠️ Edge Function uses service_role key (server-side only)

## Schema Verification Results

Last verified: [Current Date]

### Vivacity Tenant
- ✅ ID: 319
- ✅ Name: Vivacity Coaching & Consulting
- ✅ Status: active

### Enum Values
- ✅ SUPER_ADMIN_ADMINISTRATOR
- ✅ SUPER_ADMIN_TEAM_LEADER
- ✅ SUPER_ADMIN_GENERAL
- ✅ CLIENT_ADMIN
- ✅ CLIENT_USER

### Table Structures
- ✅ tenant_members: user_id, role, tenant_id columns present
- ✅ users: user_uuid, email, tenant_id, unicorn_role, user_type columns present

## Contact

For persistent issues after following this guide:
1. Check Supabase Dashboard logs
2. Review audit_eos_events table for invitation records
3. Verify RLS policies are not blocking the operation
