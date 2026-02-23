
CREATE OR REPLACE FUNCTION public.search_unicorn1_users(
  p_search text DEFAULT '',
  p_unmapped_only boolean DEFAULT true
)
RETURNS TABLE (
  "ID" bigint,
  "FirstName" text,
  "LastName" text,
  email text,
  "JobTitle" text,
  "Phone" text,
  "PhoneNumber" text,
  "Discriminator" text,
  "Archived" boolean,
  "Disabled" boolean,
  mapped_user_uuid uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u."ID",
    u."FirstName",
    u."LastName",
    u.email,
    u."JobTitle",
    u."Phone",
    u."PhoneNumber",
    u."Discriminator",
    u."Archived",
    u."Disabled",
    u.mapped_user_uuid
  FROM unicorn1.users u
  WHERE u.is_deleted = false
    AND (NOT p_unmapped_only OR u.mapped_user_uuid IS NULL)
    AND (
      p_search = ''
      OR length(trim(p_search)) < 2
      OR lower(u."FirstName") LIKE '%' || lower(trim(p_search)) || '%'
      OR lower(u."LastName") LIKE '%' || lower(trim(p_search)) || '%'
      OR lower(u.email) LIKE '%' || lower(trim(p_search)) || '%'
    )
  ORDER BY u."FirstName", u."LastName"
  LIMIT 50;
$$;
