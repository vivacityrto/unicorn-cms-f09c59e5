-- Fix GRANT for cascade_stage_recurring: the function was recreated with integer param
-- but the original GRANT was for bigint. Add grant for integer signature.
GRANT EXECUTE ON FUNCTION public.cascade_stage_recurring(integer, boolean) TO authenticated;

-- Also drop the old bigint overload if it exists to avoid ambiguity
DROP FUNCTION IF EXISTS public.cascade_stage_recurring(bigint, boolean);