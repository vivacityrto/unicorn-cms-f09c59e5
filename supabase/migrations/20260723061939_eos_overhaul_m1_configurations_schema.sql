-- ============================================================
-- EOS Meeting Overhaul — Migration 1 (Additive schema)
-- Hand-authored hotfix, applied via explicit override (root
-- CLAUDE.md, 2026-07-23) — bypasses the normal Lovable-prompt
-- path because this and the Lovable chat had lost sync on the
-- agreed design across several rounds. Verified against live
-- production schema via Supabase MCP before writing this file
-- (see PR description for the full pre-check trail).
--
-- Purely additive. No existing table is dropped or has data
-- removed. Two live-state facts changed this from every earlier
-- draft — both confirmed directly against prod, not assumed:
--   1. public.eos_segment_type already existed, but as dead,
--      fully orphaned cruft (Title Case values, missing
--      'general', zero columns/constraints/functions referencing
--      it anywhere). Dropped and recreated correctly rather than
--      left in place or blindly reused.
--   2. eos_meeting_occurrences_status_check only allows
--      ('scheduled','cancelled','completed') today — no
--      'in_progress'. The widened CHECK reflects the real 3
--      existing values + 'skipped', not the 4-value set assumed
--      in earlier drafts.
-- ============================================================

BEGIN;

-- 1. Remove the pre-existing orphaned eos_segment_type (wrong
--    values, zero real usage anywhere — confirmed via pg_depend).
DROP TYPE IF EXISTS public.eos_segment_type;

-- 2. Structural segment_type enum — the real, fixed set used to
--    replace name-keyword-matching (getSegmentType() /
--    validate_meeting_agenda).
CREATE TYPE public.eos_segment_type AS ENUM (
  'segue', 'scorecard', 'rocks', 'headlines', 'todos', 'ids', 'conclude', 'general'
);

-- 3. Parent Configuration table — one per tenant x meeting_type.
CREATE TABLE public.eos_configurations (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id              bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  meeting_type           text   NOT NULL REFERENCES public.dd_eos_meeting_type(value) ON UPDATE CASCADE ON DELETE RESTRICT,
  frequency              text   NOT NULL CHECK (frequency IN ('weekly','quarterly','annual','on_demand')),
  facilitator_seat_id    uuid   REFERENCES public.accountability_seats(id) ON DELETE SET NULL,
  visionary_seat_id      uuid   REFERENCES public.accountability_seats(id) ON DELETE SET NULL,
  integrator_seat_id     uuid   REFERENCES public.accountability_seats(id) ON DELETE SET NULL,
  participant_model      text   NOT NULL DEFAULT 'whole_roster'
                                CHECK (participant_model IN ('whole_roster','required_seats')),
  required_seat_ids      uuid[] NOT NULL DEFAULT '{}',
  scorecard_metric_cap   int    NOT NULL DEFAULT 5 CHECK (scorecard_metric_cap > 0),
  rocks_scope            text[] NOT NULL DEFAULT ARRAY['company','team'],
  description            text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  created_by             uuid REFERENCES auth.users(id),
  CONSTRAINT eos_configurations_tenant_type_unique UNIQUE (tenant_id, meeting_type)
);

CREATE INDEX eos_configurations_tenant_idx ON public.eos_configurations (tenant_id);

-- 4. Child Segments table (deferrable unique so drag-reorder
--    writes don't collide mid-transaction).
CREATE TABLE public.eos_configuration_segments (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  configuration_id   bigint NOT NULL REFERENCES public.eos_configurations(id) ON DELETE CASCADE,
  sequence_order     int  NOT NULL,
  segment_type       public.eos_segment_type NOT NULL,
  label              text NOT NULL,
  duration_minutes   int  NOT NULL CHECK (duration_minutes > 0),
  widget_key         text,
  is_required        boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eos_configuration_segments_order_unique
    UNIQUE (configuration_id, sequence_order) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX eos_configuration_segments_config_idx
  ON public.eos_configuration_segments (configuration_id, sequence_order);

-- 5. Standard updated_at triggers (project convention).
CREATE TRIGGER trg_eos_configurations_updated_at
  BEFORE UPDATE ON public.eos_configurations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_eos_configuration_segments_updated_at
  BEFORE UPDATE ON public.eos_configuration_segments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Widen eos_meeting_occurrences.status to add 'skipped'.
--    Real current allowed set confirmed live: scheduled/cancelled/completed.
ALTER TABLE public.eos_meeting_occurrences
  DROP CONSTRAINT IF EXISTS eos_meeting_occurrences_status_check;
ALTER TABLE public.eos_meeting_occurrences
  ADD CONSTRAINT eos_meeting_occurrences_status_check
  CHECK (status IN ('scheduled','cancelled','completed','skipped'));

-- 7. Permission feature row for Configuration management.
--    NOTE: 4 pre-existing feature_keys already exist in category
--    'EOS — Meetings' (eos.meetings.l10.create, .l10.participate,
--    .samepage, .quarterly) with inconsistent role_permissions grants
--    per meeting type (e.g. quarterly grants Integrator:none but
--    Team Leader:full — the reverse of l10.create). This new key is
--    additive alongside them for now; reconciling/deprecating the
--    legacy 4 in favour of this single key is real remaining work for
--    M7 (RLS + permission model), not resolved by this migration.
INSERT INTO public.permission_features (feature_key, label, module, category, description, is_active, sort_order)
VALUES ('eos.configurations.manage',
        'Meeting Configurations — manage',
        'EOS',
        'EOS — Meetings',
        'Create, edit, reorder, and archive EOS Meeting Configurations for tenant 6372',
        true,
        480)
ON CONFLICT (feature_key) DO NOTHING;

-- 8. Global feature flag (defaults OFF — frontend still reads old paths
--    until the flag flips post-verification). app_settings is a
--    single-row wide table; one boolean column per flag, matching
--    every existing flag (clickup_enabled, microsoft_addin_enabled, etc).
ALTER TABLE public.app_settings ADD COLUMN eos_config_v2 boolean NOT NULL DEFAULT false;

-- 9. Grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eos_configurations TO authenticated;
GRANT ALL ON public.eos_configurations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eos_configuration_segments TO authenticated;
GRANT ALL ON public.eos_configuration_segments TO service_role;

-- 10. RLS ON, zero policies. Zero policies + RLS enabled already denies
--     all access by default — no placeholder policy needed, and none
--     added (a placeholder RESTRICTIVE policy here would have to be
--     remembered and dropped before M7 adds real PERMISSIVE policies,
--     or it silently blocks everyone forever — simpler to never create it).
ALTER TABLE public.eos_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_configuration_segments ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

COMMIT;
