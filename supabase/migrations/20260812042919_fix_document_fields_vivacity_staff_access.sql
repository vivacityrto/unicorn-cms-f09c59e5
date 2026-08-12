-- document_fields' only working-in-theory policy (document_fields_superadmin_all) depends on
-- is_superadmin(), which checks users.global_role = 'superadmin' -- a column that is NULL for
-- 7 of the 9 real Super Admins in this system. Its other policy is tenant-scoped, which never
-- matches master/governance documents (tenant_id is null). Net effect: no Vivacity staff could
-- reliably read or write document_fields at all.
--
-- document_template_mappings solves the identical problem correctly, gating on
-- users.is_vivacity_internal = true, which is populated consistently for all 9 Super Admins
-- plus other internal roles (CSC, Team Member, Integrator, BGT). Mirroring that exact pattern.
-- Existing document_fields policies are left in place (RLS policies are permissive/OR'd), so
-- this only adds a working access path without narrowing anything.

create policy "document_fields_vivacity_select"
on public.document_fields
for select
to public
using (
  exists (
    select 1 from public.users
    where users.user_uuid = (select auth.uid())
      and users.is_vivacity_internal = true
  )
);

create policy "document_fields_vivacity_insert"
on public.document_fields
for insert
to public
with check (
  exists (
    select 1 from public.users
    where users.user_uuid = (select auth.uid())
      and users.is_vivacity_internal = true
  )
);

create policy "document_fields_vivacity_update"
on public.document_fields
for update
to public
using (
  exists (
    select 1 from public.users
    where users.user_uuid = (select auth.uid())
      and users.is_vivacity_internal = true
  )
);

create policy "document_fields_vivacity_delete"
on public.document_fields
for delete
to public
using (
  exists (
    select 1 from public.users
    where users.user_uuid = (select auth.uid())
      and users.is_vivacity_internal = true
  )
);
