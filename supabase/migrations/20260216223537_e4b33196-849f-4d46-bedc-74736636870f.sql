
-- ============================================================
-- Phase 11: AI Knowledge Graph
-- ============================================================

-- 1) knowledge_nodes
CREATE TABLE public.knowledge_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type text NOT NULL CHECK (node_type IN (
    'tenant','stage','standard_clause','template','template_version',
    'risk_event','regulator_update','audit_pack','evidence_gap','task','consultant'
  )),
  entity_id uuid NOT NULL,
  label text NOT NULL,
  metadata_json jsonb DEFAULT '{}'::jsonb,
  tenant_id bigint REFERENCES public.tenants(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_knowledge_nodes_type ON public.knowledge_nodes(node_type);
CREATE INDEX idx_knowledge_nodes_entity ON public.knowledge_nodes(entity_id);
CREATE INDEX idx_knowledge_nodes_tenant ON public.knowledge_nodes(tenant_id);

ALTER TABLE public.knowledge_nodes ENABLE ROW LEVEL SECURITY;

-- Vivacity staff see all; tenant users see own tenant nodes only
CREATE POLICY "knowledge_nodes_select_staff"
  ON public.knowledge_nodes FOR SELECT
  TO authenticated
  USING (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "knowledge_nodes_select_tenant"
  ON public.knowledge_nodes FOR SELECT
  TO authenticated
  USING (has_tenant_access_safe(tenant_id, auth.uid()));

CREATE POLICY "knowledge_nodes_insert_staff"
  ON public.knowledge_nodes FOR INSERT
  TO authenticated
  WITH CHECK (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "knowledge_nodes_delete_staff"
  ON public.knowledge_nodes FOR DELETE
  TO authenticated
  USING (is_super_admin_safe(auth.uid()));

-- 2) knowledge_edges
CREATE TABLE public.knowledge_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node_id uuid NOT NULL REFERENCES public.knowledge_nodes(id) ON DELETE CASCADE,
  to_node_id uuid NOT NULL REFERENCES public.knowledge_nodes(id) ON DELETE CASCADE,
  relationship_type text NOT NULL CHECK (relationship_type IN (
    'relates_to_clause','generated_from','impacts','assigned_to',
    'derived_from','flagged_by','influenced_by','associated_with'
  )),
  weight numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_knowledge_edges_from ON public.knowledge_edges(from_node_id);
CREATE INDEX idx_knowledge_edges_to ON public.knowledge_edges(to_node_id);
CREATE INDEX idx_knowledge_edges_type ON public.knowledge_edges(relationship_type);

ALTER TABLE public.knowledge_edges ENABLE ROW LEVEL SECURITY;

-- Edges inherit visibility from nodes (staff only for now; tenant access via edge function filtering)
CREATE POLICY "knowledge_edges_select_staff"
  ON public.knowledge_edges FOR SELECT
  TO authenticated
  USING (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "knowledge_edges_insert_staff"
  ON public.knowledge_edges FOR INSERT
  TO authenticated
  WITH CHECK (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "knowledge_edges_delete_staff"
  ON public.knowledge_edges FOR DELETE
  TO authenticated
  USING (is_super_admin_safe(auth.uid()));

-- 3) Audit trigger for node creation
CREATE OR REPLACE FUNCTION public.fn_audit_knowledge_node()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
  VALUES (
    'knowledge_node_created',
    'knowledge_nodes',
    NEW.id::text,
    auth.uid(),
    jsonb_build_object('node_type', NEW.node_type, 'label', NEW.label, 'entity_id', NEW.entity_id)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_knowledge_node
  AFTER INSERT ON public.knowledge_nodes
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_knowledge_node();

-- 4) Audit trigger for edge creation
CREATE OR REPLACE FUNCTION public.fn_audit_knowledge_edge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
  VALUES (
    'knowledge_edge_created',
    'knowledge_edges',
    NEW.id::text,
    auth.uid(),
    jsonb_build_object('relationship_type', NEW.relationship_type, 'from_node_id', NEW.from_node_id, 'to_node_id', NEW.to_node_id)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_knowledge_edge
  AFTER INSERT ON public.knowledge_edges
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_knowledge_edge();
