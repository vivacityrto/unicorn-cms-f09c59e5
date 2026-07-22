
-- L3 (16 Jul 2026 addendum): Document AI cluster.
--
-- apply/approve/reject_document_ai_suggestions operate on public.documents
-- (a per-tenant document-instance table with AI category/description
-- suggestion metadata) with zero caller-identity check and a caller-supplied,
-- forgeable p_user_id audit-attribution parameter. This is an internal
-- staff curation workflow (reviewing/approving AI-suggested categorization
-- before it's applied) -- gate: is_vivacity_team_safe(auth.uid()), and force
-- p_user_id from auth.uid() rather than trusting the parameter.
--
-- acknowledge_document / track_document_download operate on
-- tenant_document_releases -- genuine client-portal actions (a tenant
-- acknowledging/downloading their own released document) -- so these need
-- to stay reachable by the tenant's own users, not staff-only. Gate:
-- has_tenant_access_safe(tenant_id, auth.uid()), resolved from the release
-- row itself before applying the update, since the caller only supplies the
-- release id (no tenant_id parameter to check first).

create or replace function public.apply_document_ai_analysis(
  p_document_id bigint,
  p_category_confidence numeric,
  p_description_confidence numeric,
  p_suggested_category text,
  p_suggested_description text,
  p_reasoning text,
  p_user_id uuid DEFAULT NULL::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_document record;
  v_overall_confidence numeric;
  v_ai_status text;
  v_applied_category boolean := false;
  v_applied_description boolean := false;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden: staff only');
  END IF;
  p_user_id := auth.uid();

  SELECT * INTO v_document
  FROM public.documents
  WHERE id = p_document_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Document not found');
  END IF;

  v_overall_confidence := LEAST(COALESCE(p_category_confidence, 0), COALESCE(p_description_confidence, 0));

  IF v_overall_confidence >= 90 THEN
    v_ai_status := 'auto_approved';
  ELSIF v_overall_confidence >= 70 THEN
    v_ai_status := 'needs_review';
  ELSE
    v_ai_status := 'rejected';
  END IF;

  UPDATE public.documents
  SET
    ai_confidence_score = v_overall_confidence,
    ai_category_confidence = p_category_confidence,
    ai_description_confidence = p_description_confidence,
    ai_status = v_ai_status,
    ai_last_run_at = now(),
    ai_reasoning = p_reasoning,
    ai_suggested_category = p_suggested_category,
    ai_suggested_description = p_suggested_description,
    category = CASE
      WHEN v_ai_status = 'auto_approved' AND NOT COALESCE(v_document.user_edited_category, false)
      THEN COALESCE(p_suggested_category, category)
      ELSE category
    END,
    description = CASE
      WHEN v_ai_status = 'auto_approved' AND NOT COALESCE(v_document.user_edited_description, false)
      THEN COALESCE(p_suggested_description, description)
      ELSE description
    END
  WHERE id = p_document_id
  RETURNING
    (category = p_suggested_category) AS applied_cat,
    (description = p_suggested_description) AS applied_desc
  INTO v_applied_category, v_applied_description;

  INSERT INTO public.document_ai_audit (
    document_id, action, category_confidence, description_confidence,
    overall_confidence, suggested_category, suggested_description, reasoning, user_id
  ) VALUES (
    p_document_id, v_ai_status, p_category_confidence, p_description_confidence,
    v_overall_confidence, p_suggested_category, p_suggested_description, p_reasoning, p_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'ai_status', v_ai_status,
    'overall_confidence', v_overall_confidence,
    'category_applied', v_applied_category,
    'description_applied', v_applied_description,
    'user_edited_category', COALESCE(v_document.user_edited_category, false),
    'user_edited_description', COALESCE(v_document.user_edited_description, false)
  );
END;
$function$;

create or replace function public.approve_document_ai_suggestions(
  p_document_id bigint,
  p_apply_category boolean DEFAULT true,
  p_apply_description boolean DEFAULT true,
  p_user_id uuid DEFAULT NULL::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_document record;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden: staff only');
  END IF;
  p_user_id := auth.uid();

  SELECT * INTO v_document
  FROM public.documents
  WHERE id = p_document_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Document not found');
  END IF;

  IF v_document.ai_status IS NULL OR v_document.ai_status = 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No AI analysis available');
  END IF;

  UPDATE public.documents
  SET
    ai_status = 'auto_approved',
    category = CASE WHEN p_apply_category THEN COALESCE(ai_suggested_category, category) ELSE category END,
    description = CASE WHEN p_apply_description THEN COALESCE(ai_suggested_description, description) ELSE description END
  WHERE id = p_document_id;

  INSERT INTO public.document_ai_audit (
    document_id, action, category_confidence, description_confidence,
    overall_confidence, suggested_category, suggested_description, reasoning, user_id
  ) VALUES (
    p_document_id, 'user_approved', v_document.ai_category_confidence, v_document.ai_description_confidence,
    v_document.ai_confidence_score, v_document.ai_suggested_category, v_document.ai_suggested_description,
    'User approved AI suggestions', p_user_id
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;

create or replace function public.reject_document_ai_suggestions(
  p_document_id bigint,
  p_reason text DEFAULT NULL::text,
  p_user_id uuid DEFAULT NULL::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_document record;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden: staff only');
  END IF;
  p_user_id := auth.uid();

  SELECT * INTO v_document
  FROM public.documents
  WHERE id = p_document_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Document not found');
  END IF;

  UPDATE public.documents
  SET ai_status = 'rejected'
  WHERE id = p_document_id;

  INSERT INTO public.document_ai_audit (
    document_id, action, category_confidence, description_confidence,
    overall_confidence, reasoning, user_id
  ) VALUES (
    p_document_id, 'user_rejected', v_document.ai_category_confidence, v_document.ai_description_confidence,
    v_document.ai_confidence_score, COALESCE(p_reason, 'User rejected AI suggestions'), p_user_id
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;

create or replace function public.acknowledge_document(p_release_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_tenant_id bigint;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_document_releases
  WHERE id = p_release_id;

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.has_tenant_access_safe(v_tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.tenant_document_releases SET acknowledged_at = now()
  WHERE id = p_release_id AND acknowledged_at IS NULL;
END;
$function$;

create or replace function public.track_document_download(p_release_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_tenant_id bigint;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_document_releases
  WHERE id = p_release_id;

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.has_tenant_access_safe(v_tenant_id, auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.tenant_document_releases SET downloaded_at = now()
  WHERE id = p_release_id AND downloaded_at IS NULL;
END;
$function$;

NOTIFY pgrst, 'reload schema';
