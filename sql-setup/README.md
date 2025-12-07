# Multi-Tenant Database Setup

This folder contains the SQL scripts to set up the multi-tenant architecture for your Supabase database.

## Setup Instructions

Run these SQL files **in order** in your Supabase SQL Editor:

1. **01-tenant-schema.sql** - Creates the core tenant tables
2. **02-tenant-functions.sql** - Creates helper functions for tenant operations
3. **03-tenant-policies.sql** - Sets up Row Level Security policies
4. **04-seed-data.sql** - Seeds initial data for testing

## What Gets Created

### Tables
- `tenants` - Core tenant organizations
- `tenant_members` - Junction table for user-tenant relationships
- `user_invitations` - Tracks tenant invitations
- `tenant_settings` - Key-value store for tenant-specific settings

### Functions
- `is_vivacity()` - Check if user is Vivacity staff
- `is_superadmin()` - Check if user is SuperAdmin
- `current_tenant()` - Get user's active tenant context
- `create_tenant()` - Create new tenant with optional admin
- `invite_user()` - Invite user to tenant
- `accept_invite()` - Accept tenant invitation
- `set_active_tenant()` - Switch tenant context (Vivacity only)

### Sample Data
- Default organization for data migration
- Sample tenants (ACME Training, Excellence Education, etc.)
- Existing SuperAdmin users added to all tenants
- Default branding and email settings

## Next Steps

After running these scripts:

1. **Verify the tables exist** in your Supabase dashboard
2. **Test the functions** by calling them from the SQL editor
3. **Check RLS policies** are working by testing cross-tenant access
4. **Update the frontend** to use the new tenant-aware components

## Testing

You can test the setup by:

```sql
-- Test creating a tenant (as SuperAdmin)
select create_tenant('Test College', 'test-college', 'admin@test.com');

-- Test inviting a user
select invite_user(
  (select id from tenants where slug = 'test-college'),
  'user@test.com',
  'User'
);

-- Test switching tenant context (as Vivacity user)
select set_active_tenant((select id from tenants where slug = 'test-college'));
```
