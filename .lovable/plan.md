# Migration: Sync `public.users.last_sign_in_at` via `handle_user_login`

Decisions D1–D5 confirmed. One migration, no trigger DDL, no frontend impact.

## Migration SQL

```sql
-- 1. Amend handle_user_login: preserve user_activity insert, add public.users sync.
--    Tighten search_path to '' and fully schema-qualify per project standard.
CREATE OR REPLACE FUNCTION public.handle_user_login()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at THEN
    -- Preserved: append a login row to the activity ledger
    INSERT INTO public.user_activity (user_id, login_date)
    VALUES (NEW.id, COALESCE(NEW.last_sign_in_at, now()));

    -- New: mirror auth.users.last_sign_in_at into public.users so views
    -- (v_client_tenant_users etc.) read an accurate value without needing
    -- to cross the auth.users RLS boundary.
    UPDATE public.users
       SET last_sign_in_at = NEW.last_sign_in_at
     WHERE user_uuid = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_user_login() FROM PUBLIC;

-- 2. Idempotent backfill (~28 rows expected). Safe to rerun.
UPDATE public.users pu
   SET last_sign_in_at = au.last_sign_in_at
  FROM auth.users au
 WHERE au.id = pu.user_uuid
   AND pu.last_sign_in_at IS DISTINCT FROM au.last_sign_in_at;
```

No `CREATE TRIGGER`: `on_auth_user_login` already exists, already AFTER UPDATE on `auth.users`, already bound to `public.handle_user_login()`. Replacing the function body is sufficient.

## Summary

Extends the existing login trigger function to mirror `auth.users.last_sign_in_at` into `public.users.last_sign_in_at` on every sign-in, then backfills the ~28 currently out-of-sync rows. Tightens `search_path` to `''` and schema-qualifies all references. No view, hook, or frontend changes; no type regeneration impact.

## Post-deploy verification

```sql
-- Should return 0
SELECT count(*) FROM public.users pu
  JOIN auth.users au ON au.id = pu.user_uuid
 WHERE pu.last_sign_in_at IS DISTINCT FROM au.last_sign_in_at;

-- Spot-check recently active users
SELECT pu.email, pu.last_sign_in_at AS pu_lsi, au.last_sign_in_at AS au_lsi
  FROM public.users pu
  JOIN auth.users au ON au.id = pu.user_uuid
 WHERE pu.email IN ('diamondhood14@gmail.com', 'pakewit145@hilostar.com');
```

Approve this plan and I'll run the migration via `supabase--migration` in a single call.
