-- Add AI confidence scoring columns to documents table
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS ai_confidence_score numeric(5,2),
ADD COLUMN IF NOT EXISTS ai_category_confidence numeric(5,2),
ADD COLUMN IF NOT EXISTS ai_description_confidence numeric(5,2),
ADD COLUMN IF NOT EXISTS ai_status text DEFAULT 'pending' CHECK (ai_status IN ('pending', 'auto_approved', 'needs_review', 'rejected')),
ADD COLUMN IF NOT EXISTS ai_last_run_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS ai_reasoning text,
ADD COLUMN IF NOT EXISTS ai_suggested_category text,
ADD COLUMN IF NOT EXISTS ai_suggested_description text,
ADD COLUMN IF NOT EXISTS user_edited_category boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS user_edited_description boolean DEFAULT false;

-- Create audit table for AI document analysis
CREATE TABLE IF NOT EXISTS public.document_ai_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id bigint NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('analysis_run', 'auto_approved', 'needs_review', 'rejected', 'user_approved', 'user_rejected', 'user_override')),
  category_confidence numeric(5,2),
  description_confidence numeric(5,2),
  overall_confidence numeric(5,2),
  suggested_category text,
  suggested_description text,
  reasoning text,
  user_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on audit table
ALTER TABLE public.document_ai_audit ENABLE ROW LEVEL SECURITY;

-- RLS policies for document_ai_audit
CREATE POLICY "Users can view document AI audit logs"
  ON public.document_ai_audit
  FOR SELECT
  USING (true);

CREATE POLICY "Users can insert document AI audit logs"
  ON public.document_ai_audit
  FOR INSERT
  WITH CHECK (true);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_document_ai_audit_document_id ON public.document_ai_audit(document_id);
CREATE INDEX IF NOT EXISTS idx_documents_ai_status ON public.documents(ai_status);

-- Function to apply AI analysis results with auto-approval logic
CREATE OR REPLACE FUNCTION public.apply_document_ai_analysis(
  p_document_id bigint,
  p_category_confidence numeric,
  p_description_confidence numeric,
  p_suggested_category text,
  p_suggested_description text,
  p_reasoning text,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_document record;
  v_overall_confidence numeric;
  v_ai_status text;
  v_applied_category boolean := false;
  v_applied_description boolean := false;
BEGIN
  -- Get current document state
  SELECT * INTO v_document
  FROM public.documents
  WHERE id = p_document_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Document not found');
  END IF;
  
  -- Calculate overall confidence (minimum of both scores)
  v_overall_confidence := LEAST(COALESCE(p_category_confidence, 0), COALESCE(p_description_confidence, 0));
  
  -- Determine AI status based on thresholds
  IF v_overall_confidence >= 90 THEN
    v_ai_status := 'auto_approved';
  ELSIF v_overall_confidence >= 70 THEN
    v_ai_status := 'needs_review';
  ELSE
    v_ai_status := 'rejected';
  END IF;
  
  -- Update document with AI analysis results
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
    -- Only apply suggestions if auto-approved AND user hasn't edited
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
  
  -- Log to audit table
  INSERT INTO public.document_ai_audit (
    document_id,
    action,
    category_confidence,
    description_confidence,
    overall_confidence,
    suggested_category,
    suggested_description,
    reasoning,
    user_id
  ) VALUES (
    p_document_id,
    v_ai_status,
    p_category_confidence,
    p_description_confidence,
    v_overall_confidence,
    p_suggested_category,
    p_suggested_description,
    p_reasoning,
    p_user_id
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
$$;

-- Function to manually approve AI suggestions
CREATE OR REPLACE FUNCTION public.approve_document_ai_suggestions(
  p_document_id bigint,
  p_apply_category boolean DEFAULT true,
  p_apply_description boolean DEFAULT true,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_document record;
BEGIN
  -- Get current document state
  SELECT * INTO v_document
  FROM public.documents
  WHERE id = p_document_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Document not found');
  END IF;
  
  IF v_document.ai_status IS NULL OR v_document.ai_status = 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No AI analysis available');
  END IF;
  
  -- Apply the suggestions
  UPDATE public.documents
  SET
    ai_status = 'auto_approved',
    category = CASE WHEN p_apply_category THEN COALESCE(ai_suggested_category, category) ELSE category END,
    description = CASE WHEN p_apply_description THEN COALESCE(ai_suggested_description, description) ELSE description END
  WHERE id = p_document_id;
  
  -- Log the approval
  INSERT INTO public.document_ai_audit (
    document_id,
    action,
    category_confidence,
    description_confidence,
    overall_confidence,
    suggested_category,
    suggested_description,
    reasoning,
    user_id
  ) VALUES (
    p_document_id,
    'user_approved',
    v_document.ai_category_confidence,
    v_document.ai_description_confidence,
    v_document.ai_confidence_score,
    v_document.ai_suggested_category,
    v_document.ai_suggested_description,
    'User approved AI suggestions',
    p_user_id
  );
  
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function to reject AI suggestions
CREATE OR REPLACE FUNCTION public.reject_document_ai_suggestions(
  p_document_id bigint,
  p_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_document record;
BEGIN
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
    document_id,
    action,
    category_confidence,
    description_confidence,
    overall_confidence,
    reasoning,
    user_id
  ) VALUES (
    p_document_id,
    'user_rejected',
    v_document.ai_category_confidence,
    v_document.ai_description_confidence,
    v_document.ai_confidence_score,
    COALESCE(p_reason, 'User rejected AI suggestions'),
    p_user_id
  );
  
  RETURN jsonb_build_object('success', true);
END;
$$;