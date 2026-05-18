DROP FUNCTION IF EXISTS public.set_relationship_role(
  bigint, uuid, public.tenant_user_role, text
);