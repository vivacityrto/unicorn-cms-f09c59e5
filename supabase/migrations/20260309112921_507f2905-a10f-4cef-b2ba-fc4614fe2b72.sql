
-- Drop the integer-signature overload that causes ambiguity
DROP FUNCTION IF EXISTS public.start_client_package(integer, integer, text);
