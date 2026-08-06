-- Fix primary/secondary contact swaps + timeline role events (part 1/4): label helper.

CREATE OR REPLACE FUNCTION public.relationship_role_label(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_role
    WHEN 'primary_contact' THEN 'Primary Contact'
    WHEN 'secondary_contact' THEN 'Secondary Contact'
    WHEN 'user' THEN 'User'
    WHEN 'academy_user' THEN 'Academy User'
    ELSE COALESCE(p_role, '—')
  END;
$$;

REVOKE ALL ON FUNCTION public.relationship_role_label(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.relationship_role_label(text) TO authenticated, service_role;
