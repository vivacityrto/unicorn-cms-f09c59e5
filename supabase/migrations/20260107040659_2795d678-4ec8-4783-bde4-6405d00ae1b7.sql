-- Create stage_release_reviews table
CREATE TABLE public.stage_release_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_release_id uuid NOT NULL REFERENCES public.stage_releases(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id),
  reviewer_user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'in_review', 'approved', 'rejected', 'cancelled')),
  notes text NULL,
  checklist jsonb NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  completed_at timestamptz NULL
);

-- Create indexes
CREATE INDEX idx_release_reviews_release ON public.stage_release_reviews(stage_release_id);
CREATE INDEX idx_release_reviews_reviewer ON public.stage_release_reviews(reviewer_user_id);
CREATE INDEX idx_release_reviews_status ON public.stage_release_reviews(status);

-- Enable RLS
ALTER TABLE public.stage_release_reviews ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Reviewer can view their reviews" ON public.stage_release_reviews
  FOR SELECT
  USING (
    reviewer_user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.unicorn_role IN ('Super Admin', 'Admin')
    )
  );

CREATE POLICY "Admin can create reviews" ON public.stage_release_reviews
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.unicorn_role IN ('Super Admin', 'Admin')
    )
  );

CREATE POLICY "Reviewer can update their reviews" ON public.stage_release_reviews
  FOR UPDATE
  USING (
    reviewer_user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.unicorn_role IN ('Super Admin', 'Admin')
    )
  );

-- Add review enforcement setting
ALTER TABLE public.app_settings 
ADD COLUMN IF NOT EXISTS review_required_before_release boolean NOT NULL DEFAULT false;

-- Create RPC for requesting review
CREATE OR REPLACE FUNCTION public.request_stage_review(
  p_stage_release_id uuid,
  p_reviewer_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_role text;
  v_tenant_id integer;
  v_review_id uuid;
BEGIN
  -- Check caller is admin
  SELECT u.unicorn_role INTO v_user_role
  FROM public.users u
  WHERE u.user_uuid = auth.uid();

  IF v_user_role NOT IN ('Super Admin', 'Admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;

  -- Get tenant from release
  SELECT sr.tenant_id INTO v_tenant_id
  FROM public.stage_releases sr
  WHERE sr.id = p_stage_release_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Release not found');
  END IF;

  -- Check for existing active review
  IF EXISTS (
    SELECT 1 FROM public.stage_release_reviews
    WHERE stage_release_id = p_stage_release_id
    AND status IN ('requested', 'in_review')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Active review already exists');
  END IF;

  -- Create review
  INSERT INTO public.stage_release_reviews (
    stage_release_id,
    requested_by,
    reviewer_user_id,
    status
  ) VALUES (
    p_stage_release_id,
    auth.uid(),
    p_reviewer_user_id,
    'requested'
  ) RETURNING id INTO v_review_id;

  -- Audit log
  INSERT INTO public.client_audit_log (
    tenant_id, action, entity_type, entity_id, actor_user_id, details
  ) VALUES (
    v_tenant_id,
    'review.requested',
    'stage_release_review',
    v_review_id::text,
    auth.uid(),
    jsonb_build_object('stage_release_id', p_stage_release_id, 'reviewer_user_id', p_reviewer_user_id)
  );

  RETURN jsonb_build_object('success', true, 'review_id', v_review_id);
END;
$$;

-- Create RPC for updating review status
CREATE OR REPLACE FUNCTION public.update_review_status(
  p_review_id uuid,
  p_status text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_review record;
  v_tenant_id integer;
  v_is_admin boolean;
BEGIN
  -- Get review
  SELECT r.*, sr.tenant_id
  INTO v_review
  FROM public.stage_release_reviews r
  JOIN public.stage_releases sr ON sr.id = r.stage_release_id
  WHERE r.id = p_review_id;

  IF v_review IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Review not found');
  END IF;

  v_tenant_id := v_review.tenant_id;

  -- Check permissions
  v_is_admin := EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.user_uuid = auth.uid() 
    AND u.unicorn_role IN ('Super Admin', 'Admin')
  );

  -- Only reviewer or admin can update
  IF v_review.reviewer_user_id != auth.uid() AND NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;

  -- Only admin can cancel
  IF p_status = 'cancelled' AND NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only admin can cancel reviews');
  END IF;

  -- Validate status transition
  IF p_status = 'in_review' AND v_review.status != 'requested' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only start review from requested status');
  END IF;

  IF p_status IN ('approved', 'rejected') AND v_review.status != 'in_review' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Can only approve/reject from in_review status');
  END IF;

  -- Update review
  UPDATE public.stage_release_reviews
  SET 
    status = p_status,
    notes = COALESCE(p_notes, notes),
    started_at = CASE WHEN p_status = 'in_review' THEN now() ELSE started_at END,
    completed_at = CASE WHEN p_status IN ('approved', 'rejected', 'cancelled') THEN now() ELSE completed_at END
  WHERE id = p_review_id;

  -- Audit log
  INSERT INTO public.client_audit_log (
    tenant_id, action, entity_type, entity_id, actor_user_id, details
  ) VALUES (
    v_tenant_id,
    'review.' || p_status,
    'stage_release_review',
    p_review_id::text,
    auth.uid(),
    jsonb_build_object('stage_release_id', v_review.stage_release_id, 'notes', p_notes)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;