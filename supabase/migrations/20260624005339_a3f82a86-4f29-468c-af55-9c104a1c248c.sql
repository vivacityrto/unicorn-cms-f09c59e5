ALTER TABLE public.users ADD COLUMN IF NOT EXISTS kpi_pod text;

CREATE OR REPLACE FUNCTION public.get_vivacity_team_directory()
 RETURNS TABLE(user_uuid uuid, first_name text, last_name text, avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT u.user_uuid, u.first_name, u.last_name, u.avatar_url
  FROM public.users u
  WHERE u.is_vivacity_internal = true
    AND COALESCE(u.archived, false) = false
    AND COALESCE(u.disabled, false) = false
    AND COALESCE(u.kpi_pod, '') <> 'qa'
  ORDER BY u.first_name NULLS LAST, u.last_name NULLS LAST;
$function$;

CREATE OR REPLACE FUNCTION public.get_vivacity_team_directory_staff()
 RETURNS TABLE(user_uuid uuid, first_name text, last_name text, avatar_url text, email text, job_title text, unicorn_role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT u.user_uuid, u.first_name, u.last_name, u.avatar_url,
         u.email, u.job_title, u.unicorn_role
  FROM public.users u
  WHERE public.is_vivacity_team_safe(auth.uid())
    AND u.is_vivacity_internal = true
    AND COALESCE(u.archived, false) = false
    AND COALESCE(u.disabled, false) = false
    AND COALESCE(u.kpi_pod, '') <> 'qa'
  ORDER BY u.first_name NULLS LAST, u.last_name NULLS LAST;
$function$;