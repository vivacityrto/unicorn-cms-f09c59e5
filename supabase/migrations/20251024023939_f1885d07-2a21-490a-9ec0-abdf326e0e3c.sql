
-- Grant table-level permissions to authenticated users for packages table
GRANT SELECT, INSERT ON public.packages TO authenticated;
GRANT UPDATE, DELETE ON public.packages TO authenticated;

-- Also grant usage on the sequence if it exists
GRANT USAGE, SELECT ON SEQUENCE public.packages_id_seq TO authenticated;
