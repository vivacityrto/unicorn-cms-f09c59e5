-- Replace the broad authenticated SELECT (folder listing) policy on
-- academy-thumbnails with an admin-scoped list policy.
--
-- Object GET by known path for public thumbnail URLs is unchanged: the
-- bucket remains publicly readable via the public object URL. This change
-- only drops unscoped authenticated folder listing.

BEGIN;

DROP POLICY IF EXISTS "Academy thumbnails: authenticated list" ON storage.objects;

-- If thumbnails must remain listable by the Academy admin UI, scope the
-- listing policy to admin.team_users.manage instead of "authenticated":
CREATE POLICY "Academy thumbnails: admin list"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'academy-thumbnails' AND check_permission(auth.uid(), 'admin.team_users.manage', 'full'));

NOTIFY pgrst, 'reload schema';

COMMIT;
