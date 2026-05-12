CREATE TABLE IF NOT EXISTS public._tenant_users_contact_backfill_20260512 (
  id                bigint PRIMARY KEY,
  primary_contact   boolean,
  secondary_contact boolean,
  captured_at       timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public._tenant_users_contact_backfill_20260512
  (id, primary_contact, secondary_contact)
SELECT id, primary_contact, secondary_contact
FROM public.tenant_users
WHERE  (relationship_role = 'secondary_contact'
        AND (primary_contact IS DISTINCT FROM false
             OR secondary_contact IS DISTINCT FROM true))
    OR (relationship_role IN ('user','academy_user')
        AND (primary_contact = true OR secondary_contact = true
             OR primary_contact IS NULL))
ON CONFLICT (id) DO NOTHING;

UPDATE public.tenant_users
SET    primary_contact   = false,
       secondary_contact = true
WHERE  relationship_role = 'secondary_contact'
  AND  (primary_contact IS DISTINCT FROM false
        OR secondary_contact IS DISTINCT FROM true);

UPDATE public.tenant_users
SET    primary_contact   = false,
       secondary_contact = false
WHERE  relationship_role IN ('user','academy_user')
  AND  (primary_contact = true OR secondary_contact = true);

UPDATE public.tenant_users
SET    primary_contact = false
WHERE  relationship_role IN ('user','academy_user')
  AND  primary_contact IS NULL;