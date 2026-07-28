-- ============================================================
-- Public branding rollback flag
-- ============================================================
-- app_settings (the existing single-row feature-flag table) is
-- SELECT-restricted to Vivacity staff / super admins, which doesn't
-- work for a flag that needs to control what EVERY signed-in user
-- sees (including client-portal roles: primary_contact,
-- secondary_contact, academy_user). Rather than loosen app_settings'
-- RLS — it also holds SharePoint URLs and AI settings — this is a
-- tiny, purpose-built, publicly-readable table with nothing sensitive
-- in it.
--
-- legacy_branding_enabled = false (default): the 2026-07-28 Purple
--   primary color + Anton/Binate/Calibri brand fonts are live.
-- legacy_branding_enabled = true: reverts to the pre-2026-07-28 Aqua
--   primary color and drops the brand fonts. Flip via Supabase MCP
--   SQL — no redeploy needed, takes effect on next page load.

CREATE TABLE public.public_branding_config (
  id                       serial       NOT NULL,
  legacy_branding_enabled  boolean      NOT NULL DEFAULT false,
  updated_at               timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT public_branding_config_pkey PRIMARY KEY (id)
);

INSERT INTO public.public_branding_config (legacy_branding_enabled) VALUES (false);

ALTER TABLE public.public_branding_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_branding_config: authenticated read"
  ON public.public_branding_config
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "public_branding_config: super admin write"
  ON public.public_branding_config
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ─────────────────────────────────────────────────────────────
-- ROLLBACK SQL — run in order if migration must be reversed
-- ─────────────────────────────────────────────────────────────
/*
DROP TABLE IF EXISTS public.public_branding_config;
*/
