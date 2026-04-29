-- Super Admin write access to the srto-source-documents bucket.
-- SELECT policy already exists from the corpus migration; this only adds
-- INSERT / UPDATE / DELETE so Super Admins can manage source PDFs from
-- the Supabase dashboard.

create policy "Super Admins can upload SRTO source documents"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'srto-source-documents'
  and exists (
    select 1 from public.users u
    where u.user_uuid = auth.uid()
      and u.unicorn_role = 'Super Admin'
  )
);

create policy "Super Admins can update SRTO source documents"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'srto-source-documents'
  and exists (
    select 1 from public.users u
    where u.user_uuid = auth.uid()
      and u.unicorn_role = 'Super Admin'
  )
)
with check (
  bucket_id = 'srto-source-documents'
  and exists (
    select 1 from public.users u
    where u.user_uuid = auth.uid()
      and u.unicorn_role = 'Super Admin'
  )
);

create policy "Super Admins can delete SRTO source documents"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'srto-source-documents'
  and exists (
    select 1 from public.users u
    where u.user_uuid = auth.uid()
      and u.unicorn_role = 'Super Admin'
  )
);