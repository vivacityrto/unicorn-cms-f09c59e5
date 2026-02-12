-- Make sensitive storage buckets private to prevent unauthenticated access
UPDATE storage.buckets SET public = false 
WHERE id IN ('package-documents', 'document-files', 'email-files', 'tenant-note-files');