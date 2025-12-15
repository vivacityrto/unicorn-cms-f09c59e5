-- Make document-files bucket public so public URLs work
update storage.buckets set public = true where id = 'document-files';