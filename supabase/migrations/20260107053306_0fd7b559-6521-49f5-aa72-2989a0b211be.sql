-- ==========================================================
-- Phase 3: Excel Template Bindings & Lookup Lists
-- ==========================================================

-- 1. Create lookup_lists table (for dropdown values)
CREATE TABLE IF NOT EXISTS public.lookup_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer REFERENCES public.tenants(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, key)
);

-- 2. Create lookup_list_items table
CREATE TABLE IF NOT EXISTS public.lookup_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.lookup_lists(id) ON DELETE CASCADE,
  value text NOT NULL,
  label text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Create excel_template_bindings table
CREATE TABLE IF NOT EXISTS public.excel_template_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id bigint NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  binding_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'error')),
  detected_tokens jsonb NOT NULL DEFAULT '[]'::jsonb,
  detected_dropdowns jsonb NOT NULL DEFAULT '[]'::jsonb,
  token_bindings jsonb NOT NULL DEFAULT '{}'::jsonb,
  dropdown_bindings jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_validated_at timestamptz,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id)
);

-- 4. Create excel_generated_files table
CREATE TABLE IF NOT EXISTS public.excel_generated_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id bigint NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_legacy_id text,
  package_id bigint REFERENCES public.packages(id) ON DELETE SET NULL,
  stage_id bigint REFERENCES public.documents_stages(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  file_name text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid REFERENCES auth.users(id),
  merge_data_used jsonb,
  dropdown_data_used jsonb
);

-- 5. Create indexes
CREATE INDEX IF NOT EXISTS idx_excel_template_bindings_document_id 
  ON public.excel_template_bindings(document_id);

CREATE INDEX IF NOT EXISTS idx_lookup_lists_tenant_key 
  ON public.lookup_lists(tenant_id, key);

CREATE INDEX IF NOT EXISTS idx_lookup_list_items_list_sort 
  ON public.lookup_list_items(list_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_excel_generated_files_document 
  ON public.excel_generated_files(document_id);

CREATE INDEX IF NOT EXISTS idx_excel_generated_files_tenant 
  ON public.excel_generated_files(tenant_id);

-- 6. Enable RLS
ALTER TABLE public.lookup_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lookup_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.excel_template_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.excel_generated_files ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for lookup_lists
CREATE POLICY "lookup_lists_select_policy" ON public.lookup_lists
  FOR SELECT USING (
    tenant_id IS NULL 
    OR EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND (u.tenant_id = lookup_lists.tenant_id OR u.role IN ('super_admin', 'admin', 'team'))
    )
  );

CREATE POLICY "lookup_lists_insert_policy" ON public.lookup_lists
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.role IN ('super_admin', 'admin', 'team')
    )
  );

CREATE POLICY "lookup_lists_update_policy" ON public.lookup_lists
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.role IN ('super_admin', 'admin', 'team')
    )
  );

CREATE POLICY "lookup_lists_delete_policy" ON public.lookup_lists
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.role IN ('super_admin', 'admin')
    )
  );

-- 8. RLS Policies for lookup_list_items
CREATE POLICY "lookup_list_items_select_policy" ON public.lookup_list_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.lookup_lists ll 
      WHERE ll.id = lookup_list_items.list_id
      AND (
        ll.tenant_id IS NULL 
        OR EXISTS (
          SELECT 1 FROM public.users u 
          WHERE u.user_uuid = auth.uid() 
          AND (u.tenant_id = ll.tenant_id OR u.role IN ('super_admin', 'admin', 'team'))
        )
      )
    )
  );

CREATE POLICY "lookup_list_items_insert_policy" ON public.lookup_list_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.role IN ('super_admin', 'admin', 'team')
    )
  );

CREATE POLICY "lookup_list_items_update_policy" ON public.lookup_list_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.role IN ('super_admin', 'admin', 'team')
    )
  );

CREATE POLICY "lookup_list_items_delete_policy" ON public.lookup_list_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.role IN ('super_admin', 'admin', 'team')
    )
  );

-- 9. RLS Policies for excel_template_bindings
CREATE POLICY "excel_template_bindings_select_policy" ON public.excel_template_bindings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.role IN ('super_admin', 'admin', 'team')
    )
  );

CREATE POLICY "excel_template_bindings_insert_policy" ON public.excel_template_bindings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.role IN ('super_admin', 'admin', 'team')
    )
  );

CREATE POLICY "excel_template_bindings_update_policy" ON public.excel_template_bindings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.role IN ('super_admin', 'admin', 'team')
    )
  );

CREATE POLICY "excel_template_bindings_delete_policy" ON public.excel_template_bindings
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.role IN ('super_admin', 'admin')
    )
  );

-- 10. RLS Policies for excel_generated_files
CREATE POLICY "excel_generated_files_select_policy" ON public.excel_generated_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND (u.tenant_id = excel_generated_files.tenant_id OR u.role IN ('super_admin', 'admin', 'team'))
    )
  );

CREATE POLICY "excel_generated_files_insert_policy" ON public.excel_generated_files
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.role IN ('super_admin', 'admin', 'team')
    )
  );

CREATE POLICY "excel_generated_files_delete_policy" ON public.excel_generated_files
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.user_uuid = auth.uid() 
      AND u.role IN ('super_admin', 'admin')
    )
  );

-- 11. Create RPC to upsert excel bindings after scan
CREATE OR REPLACE FUNCTION public.upsert_excel_template_bindings(
  p_document_id bigint,
  p_detected_tokens jsonb,
  p_detected_dropdowns jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_binding_id uuid;
  v_existing_token_bindings jsonb;
  v_existing_dropdown_bindings jsonb;
  v_merged_token_bindings jsonb := '{}'::jsonb;
  v_merged_dropdown_bindings jsonb := '{}'::jsonb;
  v_token record;
  v_dropdown record;
BEGIN
  -- Get existing bindings if any
  SELECT id, token_bindings, dropdown_bindings
  INTO v_binding_id, v_existing_token_bindings, v_existing_dropdown_bindings
  FROM public.excel_template_bindings
  WHERE document_id = p_document_id;

  -- Preserve existing token bindings for tokens that still exist
  IF v_existing_token_bindings IS NOT NULL THEN
    FOR v_token IN SELECT jsonb_array_elements(p_detected_tokens) AS token
    LOOP
      IF v_existing_token_bindings ? (v_token.token->>'token') THEN
        v_merged_token_bindings := v_merged_token_bindings || 
          jsonb_build_object(v_token.token->>'token', v_existing_token_bindings->(v_token.token->>'token'));
      END IF;
    END LOOP;
  END IF;

  -- Preserve existing dropdown bindings for dropdowns that still exist
  IF v_existing_dropdown_bindings IS NOT NULL THEN
    FOR v_dropdown IN SELECT jsonb_array_elements(p_detected_dropdowns) AS dropdown
    LOOP
      IF v_existing_dropdown_bindings ? (v_dropdown.dropdown->>'dropdown_id') THEN
        v_merged_dropdown_bindings := v_merged_dropdown_bindings || 
          jsonb_build_object(v_dropdown.dropdown->>'dropdown_id', v_existing_dropdown_bindings->(v_dropdown.dropdown->>'dropdown_id'));
      END IF;
    END LOOP;
  END IF;

  -- Upsert the bindings record
  INSERT INTO public.excel_template_bindings (
    document_id,
    detected_tokens,
    detected_dropdowns,
    token_bindings,
    dropdown_bindings,
    binding_version,
    status,
    updated_at
  )
  VALUES (
    p_document_id,
    p_detected_tokens,
    p_detected_dropdowns,
    v_merged_token_bindings,
    v_merged_dropdown_bindings,
    COALESCE((SELECT binding_version + 1 FROM public.excel_template_bindings WHERE document_id = p_document_id), 1),
    'draft',
    now()
  )
  ON CONFLICT (document_id)
  DO UPDATE SET
    detected_tokens = EXCLUDED.detected_tokens,
    detected_dropdowns = EXCLUDED.detected_dropdowns,
    token_bindings = v_merged_token_bindings,
    dropdown_bindings = v_merged_dropdown_bindings,
    binding_version = public.excel_template_bindings.binding_version + 1,
    status = 'draft',
    updated_at = now()
  RETURNING id INTO v_binding_id;

  RETURN v_binding_id;
END;
$$;

-- 12. Create RPC to validate excel bindings
CREATE OR REPLACE FUNCTION public.validate_excel_bindings(
  p_document_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_bindings record;
  v_errors jsonb := '[]'::jsonb;
  v_token record;
  v_dropdown record;
  v_list_count integer;
  v_status text := 'ready';
BEGIN
  -- Get bindings
  SELECT * INTO v_bindings
  FROM public.excel_template_bindings
  WHERE document_id = p_document_id;

  IF v_bindings IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'errors', jsonb_build_array(jsonb_build_object(
        'type', 'no_bindings',
        'message', 'No bindings record found for this document'
      )),
      'status', 'error'
    );
  END IF;

  -- Check for unbound tokens
  FOR v_token IN SELECT jsonb_array_elements(v_bindings.detected_tokens) AS token
  LOOP
    IF NOT (v_bindings.token_bindings ? (v_token.token->>'token')) THEN
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'type', 'unbound_token',
        'token', v_token.token->>'token',
        'location', v_token.token->>'sheet' || '!' || v_token.token->>'cell',
        'message', 'Token is not bound to a data source'
      ));
      v_status := 'error';
    END IF;
  END LOOP;

  -- Check for unbound dropdowns
  FOR v_dropdown IN SELECT jsonb_array_elements(v_bindings.detected_dropdowns) AS dropdown
  LOOP
    IF NOT (v_bindings.dropdown_bindings ? (v_dropdown.dropdown->>'dropdown_id')) THEN
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'type', 'unbound_dropdown',
        'dropdown_id', v_dropdown.dropdown->>'dropdown_id',
        'location', v_dropdown.dropdown->>'sheet' || '!' || v_dropdown.dropdown->>'cell',
        'message', 'Dropdown is not bound to a lookup list'
      ));
      v_status := 'error';
    ELSE
      -- Check if bound list has items
      SELECT COUNT(*) INTO v_list_count
      FROM public.lookup_list_items li
      JOIN public.lookup_lists ll ON ll.id = li.list_id
      WHERE ll.id = (v_bindings.dropdown_bindings->(v_dropdown.dropdown->>'dropdown_id')->>'list_id')::uuid
        AND li.is_active = true;
      
      IF v_list_count = 0 THEN
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'type', 'empty_list',
          'dropdown_id', v_dropdown.dropdown->>'dropdown_id',
          'location', v_dropdown.dropdown->>'sheet' || '!' || v_dropdown.dropdown->>'cell',
          'message', 'Bound lookup list has no active items'
        ));
        v_status := 'error';
      END IF;
    END IF;
  END LOOP;

  -- Update bindings status
  UPDATE public.excel_template_bindings
  SET 
    status = v_status,
    validation_errors = v_errors,
    last_validated_at = now(),
    updated_at = now()
  WHERE document_id = p_document_id;

  RETURN jsonb_build_object(
    'success', v_status = 'ready',
    'errors', v_errors,
    'status', v_status
  );
END;
$$;

-- 13. Create updated_at trigger for excel_template_bindings
CREATE OR REPLACE FUNCTION public.update_excel_bindings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_excel_template_bindings_updated_at
  BEFORE UPDATE ON public.excel_template_bindings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_excel_bindings_updated_at();

-- 14. Create updated_at trigger for lookup_lists
CREATE TRIGGER update_lookup_lists_updated_at
  BEFORE UPDATE ON public.lookup_lists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_excel_bindings_updated_at();