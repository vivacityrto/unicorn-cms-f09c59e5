-- Create public storage bucket for document files if it does not exist
insert into storage.buckets (id, name, public)
values ('document-files', 'document-files', true)
on conflict (id) do nothing;

-- Drop existing policies if they exist, then recreate them
drop policy if exists "Public read access for document-files" on storage.objects;
drop policy if exists "Authenticated upload document-files" on storage.objects;
drop policy if exists "Authenticated update document-files" on storage.objects;
drop policy if exists "Authenticated delete document-files" on storage.objects;

-- Allow public read access to files in the document-files bucket
create policy "Public read access for document-files"
  on storage.objects
  for select
  using (bucket_id = 'document-files');

-- Allow authenticated users to upload files to document-files bucket
create policy "Authenticated upload document-files"
  on storage.objects
  for insert
  with check (
    bucket_id = 'document-files'
    and auth.role() = 'authenticated'
  );

-- Allow authenticated users to update their own files in document-files bucket
create policy "Authenticated update document-files"
  on storage.objects
  for update
  using (
    bucket_id = 'document-files'
    and auth.role() = 'authenticated'
  )
  with check (
    bucket_id = 'document-files'
    and auth.role() = 'authenticated'
  );

-- Allow authenticated users to delete their own files in document-files bucket
create policy "Authenticated delete document-files"
  on storage.objects
  for delete
  using (
    bucket_id = 'document-files'
    and auth.role() = 'authenticated'
  );