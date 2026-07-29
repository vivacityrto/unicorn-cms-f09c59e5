-- Second follow-up to 20260729050455_fix_broken_fk_relationships_and_tga_status.sql.
--
-- Peeling back the /admin/reviews query one more layer: after fixing the
-- reviewer and stage embeds, the same query's `tenant:tenants(name)` embed
-- on stage_releases also 400s -- stage_releases.tenant_id has no FK to
-- tenants at all (column exists, constraint doesn't; same pattern as the
-- compliance_pack_exports and stages fixes in the prior migration).
--
-- stage_releases is completely empty in prod (confirmed via a read-only
-- count before writing this migration), so this is zero-risk.

ALTER TABLE public.stage_releases
  ADD CONSTRAINT stage_releases_tenant_id_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
