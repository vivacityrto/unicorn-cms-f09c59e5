-- ============================================
-- RLS POLICIES - Remaining tenant core tables
-- tenant_settings doesn't exist, so we skip it
-- ============================================

-- The helper functions and policies for tenants, tenant_members were already created
-- We just need to complete the user_invitations policies

-- 2.3 user_invitations RLS - remaining policies
create policy "invites_insert_admin_or_sa"
on public.user_invitations
for insert
to authenticated
with check (
  public.is_super_admin()
  or public.is_tenant_admin(user_invitations.tenant_id)
);

create policy "invites_update_admin_or_sa"
on public.user_invitations
for update
to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_admin(user_invitations.tenant_id)
)
with check (
  public.is_super_admin()
  or public.is_tenant_admin(user_invitations.tenant_id)
);

create policy "invites_delete_admin_or_sa"
on public.user_invitations
for delete
to authenticated
using (
  public.is_super_admin()
  or public.is_tenant_admin(user_invitations.tenant_id)
);