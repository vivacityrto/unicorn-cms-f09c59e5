-- Add type column to notification_tenants table
ALTER TABLE public.notification_tenants 
ADD COLUMN type text NOT NULL DEFAULT 'Document Received';

-- Add a check constraint to ensure valid types
ALTER TABLE public.notification_tenants 
ADD CONSTRAINT notification_type_check 
CHECK (type IN ('Document Received', 'Document Updated'));