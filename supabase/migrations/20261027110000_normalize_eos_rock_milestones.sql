-- Normalize Rock milestones so owners can track dates, priority, acceptance,
-- evidence and progress independently from the parent Rock.

CREATE TABLE IF NOT EXISTS public.eos_rock_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL,
  rock_id uuid NOT NULL REFERENCES public.eos_rocks(id) ON DELETE CASCADE,
  legacy_source_id uuid,
  legacy_snapshot jsonb,
  title text NOT NULL,
  owner_id uuid,
  due_date date,
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'blocked', 'complete', 'off_track', 'deferred')),
  exit_criteria text,
  evidence_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eos_rock_milestones_rock_legacy_source_key UNIQUE (rock_id, legacy_source_id),
  CONSTRAINT eos_rock_milestones_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT eos_rock_milestones_evidence_url_check
    CHECK (evidence_url IS NULL OR evidence_url ~* '^https?://')
);

CREATE INDEX IF NOT EXISTS idx_eos_rock_milestones_rock_order
  ON public.eos_rock_milestones (rock_id, sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_eos_rock_milestones_tenant_due
  ON public.eos_rock_milestones (tenant_id, due_date)
  WHERE status NOT IN ('complete', 'deferred');
CREATE INDEX IF NOT EXISTS idx_eos_rock_milestones_owner
  ON public.eos_rock_milestones (owner_id)
  WHERE owner_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.eos_rock_milestone_links (
  tenant_id bigint NOT NULL,
  company_milestone_id uuid NOT NULL,
  individual_milestone_id uuid NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_milestone_id, individual_milestone_id),
  CONSTRAINT eos_rock_milestone_links_company_fk
    FOREIGN KEY (company_milestone_id, tenant_id)
    REFERENCES public.eos_rock_milestones(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT eos_rock_milestone_links_individual_fk
    FOREIGN KEY (individual_milestone_id, tenant_id)
    REFERENCES public.eos_rock_milestones(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT eos_rock_milestone_links_distinct CHECK (company_milestone_id <> individual_milestone_id)
);

CREATE INDEX IF NOT EXISTS idx_eos_rock_milestone_links_individual
  ON public.eos_rock_milestone_links (individual_milestone_id);

CREATE TABLE IF NOT EXISTS public.eos_rock_milestone_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('milestone', 'link')),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'deleted')),
  actor_user_id uuid,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eos_rock_milestone_events_entity
  ON public.eos_rock_milestone_events (tenant_id, entity_type, entity_id, occurred_at DESC);

DROP TRIGGER IF EXISTS eos_rock_milestones_updated_at ON public.eos_rock_milestones;
CREATE TRIGGER eos_rock_milestones_updated_at
  BEFORE UPDATE ON public.eos_rock_milestones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.eos_rock_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_rock_milestone_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eos_rock_milestone_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eos_rock_milestones_select ON public.eos_rock_milestones;
CREATE POLICY eos_rock_milestones_select ON public.eos_rock_milestones
  FOR SELECT TO authenticated
  USING (
    public.is_vivacity_team_user((SELECT auth.uid()))
    OR public.has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR public.is_super_admin()
  );
DROP POLICY IF EXISTS eos_rock_milestones_manage ON public.eos_rock_milestones;
CREATE POLICY eos_rock_milestones_manage ON public.eos_rock_milestones
  FOR ALL TO authenticated
  USING (
    public.is_vivacity_team_user((SELECT auth.uid()))
    OR public.has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR public.is_super_admin()
  )
  WITH CHECK (
    public.is_vivacity_team_user((SELECT auth.uid()))
    OR public.has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS eos_rock_milestone_links_select ON public.eos_rock_milestone_links;
CREATE POLICY eos_rock_milestone_links_select ON public.eos_rock_milestone_links
  FOR SELECT TO authenticated
  USING (
    public.is_vivacity_team_user((SELECT auth.uid()))
    OR public.has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR public.is_super_admin()
  );
DROP POLICY IF EXISTS eos_rock_milestone_links_manage ON public.eos_rock_milestone_links;
CREATE POLICY eos_rock_milestone_links_manage ON public.eos_rock_milestone_links
  FOR ALL TO authenticated
  USING (
    public.is_vivacity_team_user((SELECT auth.uid()))
    OR public.has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR public.is_super_admin()
  )
  WITH CHECK (
    public.is_vivacity_team_user((SELECT auth.uid()))
    OR public.has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS eos_rock_milestone_events_select ON public.eos_rock_milestone_events;
CREATE POLICY eos_rock_milestone_events_select ON public.eos_rock_milestone_events
  FOR SELECT TO authenticated
  USING (
    public.is_vivacity_team_user((SELECT auth.uid()))
    OR public.has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR public.is_super_admin()
  );

REVOKE ALL ON public.eos_rock_milestone_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.eos_rock_milestone_events TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_eos_rock_milestone_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (NEW.rock_id IS DISTINCT FROM OLD.rock_id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id) THEN
    RAISE EXCEPTION 'A milestone cannot be moved between Rocks or tenants';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.eos_rocks
    WHERE id = NEW.rock_id AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Milestone Rock and tenant must match';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_eos_rock_milestone_scope() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS validate_eos_rock_milestone_scope ON public.eos_rock_milestones;
CREATE TRIGGER validate_eos_rock_milestone_scope
  BEFORE INSERT OR UPDATE ON public.eos_rock_milestones
  FOR EACH ROW EXECUTE FUNCTION public.validate_eos_rock_milestone_scope();

CREATE OR REPLACE FUNCTION public.validate_eos_rock_milestone_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  company_rock_id uuid;
  individual_rock_id uuid;
  individual_parent_id uuid;
  individual_grandparent_id uuid;
BEGIN
  SELECT rock_id INTO company_rock_id
  FROM public.eos_rock_milestones
  WHERE id = NEW.company_milestone_id AND tenant_id = NEW.tenant_id;

  SELECT rock_id INTO individual_rock_id
  FROM public.eos_rock_milestones
  WHERE id = NEW.individual_milestone_id AND tenant_id = NEW.tenant_id;

  IF company_rock_id IS NULL OR individual_rock_id IS NULL THEN
    RAISE EXCEPTION 'Both milestones must belong to the selected tenant';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.eos_rocks
    WHERE id = company_rock_id AND tenant_id = NEW.tenant_id AND rock_level = 'company'
  ) THEN
    RAISE EXCEPTION 'Company milestone must belong to a Company Rock';
  END IF;

  SELECT parent_rock_id INTO individual_parent_id
  FROM public.eos_rocks
  WHERE id = individual_rock_id AND tenant_id = NEW.tenant_id AND rock_level = 'individual';

  SELECT parent_rock_id INTO individual_grandparent_id
  FROM public.eos_rocks
  WHERE id = individual_parent_id AND tenant_id = NEW.tenant_id AND rock_level = 'team';

  IF individual_parent_id IS DISTINCT FROM company_rock_id
     AND individual_grandparent_id IS DISTINCT FROM company_rock_id THEN
    RAISE EXCEPTION 'Individual milestone must belong to an Individual Rock under the linked Company Rock';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_eos_rock_milestone_link() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS validate_eos_rock_milestone_link ON public.eos_rock_milestone_links;
CREATE TRIGGER validate_eos_rock_milestone_link
  BEFORE INSERT OR UPDATE ON public.eos_rock_milestone_links
  FOR EACH ROW EXECUTE FUNCTION public.validate_eos_rock_milestone_link();

CREATE OR REPLACE FUNCTION public.record_eos_rock_milestone_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  row_data jsonb;
  old_data jsonb;
  event_tenant_id bigint;
  entity_kind text;
  entity_uuid uuid;
  action_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    row_data := to_jsonb(NEW);
    event_tenant_id := NEW.tenant_id;
    IF TG_TABLE_NAME = 'eos_rock_milestones' THEN
      entity_uuid := NEW.id;
    ELSE
      entity_uuid := NEW.company_milestone_id;
    END IF;
    action_name := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    row_data := to_jsonb(NEW);
    old_data := to_jsonb(OLD);
    IF (row_data - 'updated_at') IS NOT DISTINCT FROM (old_data - 'updated_at') THEN
      RETURN NEW;
    END IF;
    event_tenant_id := NEW.tenant_id;
    IF TG_TABLE_NAME = 'eos_rock_milestones' THEN
      entity_uuid := NEW.id;
    ELSE
      entity_uuid := NEW.company_milestone_id;
    END IF;
    action_name := 'updated';
  ELSE
    old_data := to_jsonb(OLD);
    event_tenant_id := OLD.tenant_id;
    IF TG_TABLE_NAME = 'eos_rock_milestones' THEN
      entity_uuid := OLD.id;
    ELSE
      entity_uuid := OLD.company_milestone_id;
    END IF;
    action_name := 'deleted';
  END IF;

  entity_kind := CASE WHEN TG_TABLE_NAME = 'eos_rock_milestones' THEN 'milestone' ELSE 'link' END;
  INSERT INTO public.eos_rock_milestone_events
    (tenant_id, entity_type, entity_id, action, actor_user_id, before_data, after_data)
  VALUES
    (event_tenant_id, entity_kind, entity_uuid, action_name, auth.uid(), old_data, row_data);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_eos_rock_milestone_event() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS eos_rock_milestones_record_event ON public.eos_rock_milestones;
CREATE TRIGGER eos_rock_milestones_record_event
  AFTER INSERT OR UPDATE OR DELETE ON public.eos_rock_milestones
  FOR EACH ROW EXECUTE FUNCTION public.record_eos_rock_milestone_event();
DROP TRIGGER IF EXISTS eos_rock_milestone_links_record_event ON public.eos_rock_milestone_links;
CREATE TRIGGER eos_rock_milestone_links_record_event
  AFTER INSERT OR UPDATE OR DELETE ON public.eos_rock_milestone_links
  FOR EACH ROW EXECUTE FUNCTION public.record_eos_rock_milestone_event();

-- Preserve every legacy JSON item and its original payload while creating the
-- normalized milestone records. The source column remains intact for rollback.
INSERT INTO public.eos_rock_milestones (
  id, tenant_id, rock_id, legacy_source_id, legacy_snapshot, title, owner_id,
  due_date, priority, status, sort_order, created_by
)
SELECT
  md5('eos-rock-milestone:' || r.id::text || ':' || item.ordinality::text)::uuid,
  r.tenant_id,
  r.id,
  CASE
    WHEN item.value->>'id' IS NOT NULL
      THEN md5('eos-rock-legacy-source:' || r.id::text || ':' || item.ordinality::text || ':' || (item.value->>'id'))::uuid
    ELSE md5('eos-rock-legacy-source:' || r.id::text || ':' || item.ordinality::text)::uuid
  END,
  item.value,
  COALESCE(NULLIF(item.value->>'text', ''), NULLIF(item.value->>'title', ''), '(untitled milestone)'),
  r.owner_id,
  r.due_date,
  'medium',
  CASE WHEN lower(COALESCE(item.value->>'completed', 'false')) = 'true' THEN 'complete' ELSE 'not_started' END,
  (item.ordinality - 1)::integer,
  r.created_by
FROM public.eos_rocks r
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(r.milestones) = 'array' THEN r.milestones ELSE '[]'::jsonb END
) WITH ORDINALITY AS item(value, ordinality)
WHERE NOT EXISTS (
  SELECT 1 FROM public.eos_rock_milestones m
  WHERE m.rock_id = r.id AND m.sort_order = (item.ordinality - 1)::integer
    AND m.legacy_snapshot = item.value
);
