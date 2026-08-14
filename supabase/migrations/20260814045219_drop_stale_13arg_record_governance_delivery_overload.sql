-- CREATE OR REPLACE FUNCTION with an added parameter creates a new overload
-- rather than replacing the function when the argument list's arity changes —
-- confirmed both a 13-arg and 14-arg record_governance_delivery_and_mark_generated
-- existed after the prior migration (20260814045117). Drop the stale 13-arg
-- one so only the p_batch_id-aware version survives (leaving both in place
-- is a call-resolution ambiguity risk for any caller still using the
-- original 13 named parameters).

DROP FUNCTION IF EXISTS public.record_governance_delivery_and_mark_generated(
  bigint, bigint, uuid, uuid, text, text, text, text, uuid, integer, jsonb, jsonb, text
);
