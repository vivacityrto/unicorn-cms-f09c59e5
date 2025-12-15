-- Add description column to documents_categories table
ALTER TABLE public.documents_categories
ADD COLUMN description text NULL;