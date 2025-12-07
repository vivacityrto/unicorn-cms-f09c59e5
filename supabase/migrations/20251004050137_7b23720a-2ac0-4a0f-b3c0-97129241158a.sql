-- Remove redundant ordernumber column from documents table
-- The INT8 id column will serve as the order number

ALTER TABLE public.documents DROP COLUMN IF EXISTS ordernumber;