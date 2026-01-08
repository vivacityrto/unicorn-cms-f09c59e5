-- ============================================
-- Client Workboard: Enhanced Action Items
-- ============================================

-- Step 1: Alter client_action_items to add workboard columns
ALTER TABLE public.client_action_items 
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS package_id bigint NULL,
  ADD COLUMN IF NOT EXISTS stage_id bigint NULL,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assignee_user_id uuid NULL;

-- Add foreign keys
ALTER TABLE public.client_action_items
  ADD CONSTRAINT fk_client_action_items_package 
    FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_client_action_items_stage 
    FOREIGN KEY (stage_id) REFERENCES public.documents_stages(id) ON DELETE SET NULL;

-- Add check constraint for item_type
ALTER TABLE public.client_action_items
  ADD CONSTRAINT chk_item_type CHECK (item_type IN ('internal', 'client'));

-- Update status values: alter priority constraint 
-- First drop existing if any, then add new ones
ALTER TABLE public.client_action_items 
  DROP CONSTRAINT IF EXISTS chk_status,
  DROP CONSTRAINT IF EXISTS chk_priority;

ALTER TABLE public.client_action_items
  ADD CONSTRAINT chk_status CHECK (status IN ('todo', 'in_progress', 'blocked', 'waiting_client', 'done', 'cancelled')),
  ADD CONSTRAINT chk_priority CHECK (priority IN ('low', 'medium', 'high', 'urgent'));

-- Migrate existing status values
UPDATE public.client_action_items 
SET status = 'todo' WHERE status = 'open';

UPDATE public.client_action_items 
SET priority = 'medium' WHERE priority = 'normal';

-- Copy owner_user_id to assignee_user_id for existing records
UPDATE public.client_action_items 
SET assignee_user_id = owner_user_id 
WHERE owner_user_id IS NOT NULL AND assignee_user_id IS NULL;

-- Create indexes for workboard queries
CREATE INDEX IF NOT EXISTS idx_client_action_items_workboard 
  ON public.client_action_items (tenant_id, client_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_client_action_items_assignee 
  ON public.client_action_items (tenant_id, assignee_user_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_client_action_items_package 
  ON public.client_action_items (package_id) WHERE package_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_action_items_stage 
  ON public.client_action_items (stage_id) WHERE stage_id IS NOT NULL;

-- ============================================
-- Client Action Item Comments
-- ============================================

CREATE TABLE IF NOT EXISTS public.client_action_item_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action_item_id uuid NOT NULL REFERENCES public.client_action_items(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fetching comments
CREATE INDEX IF NOT EXISTS idx_action_item_comments_item 
  ON public.client_action_item_comments (action_item_id, created_at);

-- Enable RLS
ALTER TABLE public.client_action_item_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for comments
CREATE POLICY "Comments tenant isolation" ON public.client_action_item_comments
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- Timeline Event Triggers
-- ============================================

-- Function to log action item events to timeline
CREATE OR REPLACE FUNCTION public.log_action_item_timeline_event()
RETURNS TRIGGER AS $$
DECLARE
  v_event_type text;
  v_title text;
  v_metadata jsonb;
  v_client_id_int bigint;
BEGIN
  -- Convert client_id string to bigint for timeline
  v_client_id_int := NEW.client_id::bigint;
  
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'action_item_created';
    v_title := 'Action item created: ' || NEW.title;
    v_metadata := jsonb_build_object(
      'action_item_id', NEW.id,
      'title', NEW.title,
      'status', NEW.status,
      'priority', NEW.priority,
      'item_type', NEW.item_type
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Check what changed
    IF OLD.status != NEW.status THEN
      IF NEW.status = 'done' THEN
        v_event_type := 'action_item_completed';
        v_title := 'Action item completed: ' || NEW.title;
      ELSE
        v_event_type := 'action_item_updated';
        v_title := 'Action item status changed to ' || NEW.status || ': ' || NEW.title;
      END IF;
    ELSIF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
      v_event_type := 'action_item_updated';
      v_title := 'Action item due date changed: ' || NEW.title;
    ELSE
      -- Other updates
      v_event_type := 'action_item_updated';
      v_title := 'Action item updated: ' || NEW.title;
    END IF;
    
    v_metadata := jsonb_build_object(
      'action_item_id', NEW.id,
      'title', NEW.title,
      'old_status', OLD.status,
      'new_status', NEW.status,
      'status', NEW.status,
      'priority', NEW.priority
    );
  ELSE
    RETURN NEW;
  END IF;
  
  -- Insert timeline event
  INSERT INTO public.client_timeline_events (
    tenant_id,
    client_id,
    event_type,
    source,
    title,
    entity_type,
    entity_id,
    metadata,
    created_by
  ) VALUES (
    NEW.tenant_id,
    v_client_id_int,
    v_event_type,
    'system',
    v_title,
    'action_item',
    NEW.id,
    v_metadata,
    COALESCE(NEW.created_by, auth.uid())
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger
DROP TRIGGER IF EXISTS trg_action_item_timeline ON public.client_action_items;
CREATE TRIGGER trg_action_item_timeline
  AFTER INSERT OR UPDATE ON public.client_action_items
  FOR EACH ROW
  EXECUTE FUNCTION public.log_action_item_timeline_event();

-- Function to log comment events
CREATE OR REPLACE FUNCTION public.log_action_item_comment_timeline()
RETURNS TRIGGER AS $$
DECLARE
  v_action_item record;
  v_client_id_int bigint;
BEGIN
  -- Get action item details
  SELECT * INTO v_action_item 
  FROM public.client_action_items 
  WHERE id = NEW.action_item_id;
  
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  
  v_client_id_int := v_action_item.client_id::bigint;
  
  -- Insert timeline event
  INSERT INTO public.client_timeline_events (
    tenant_id,
    client_id,
    event_type,
    source,
    title,
    body,
    entity_type,
    entity_id,
    metadata,
    created_by
  ) VALUES (
    NEW.tenant_id,
    v_client_id_int,
    'action_item_comment',
    'user',
    'Comment added to action item: ' || v_action_item.title,
    LEFT(NEW.body, 200),
    'action_item_comment',
    NEW.id,
    jsonb_build_object(
      'action_item_id', NEW.action_item_id,
      'action_item_title', v_action_item.title
    ),
    NEW.created_by
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for comments
DROP TRIGGER IF EXISTS trg_action_item_comment_timeline ON public.client_action_item_comments;
CREATE TRIGGER trg_action_item_comment_timeline
  AFTER INSERT ON public.client_action_item_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.log_action_item_comment_timeline();

-- ============================================
-- Updated_at trigger for action items
-- ============================================

CREATE OR REPLACE FUNCTION public.update_action_item_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_action_items_updated_at ON public.client_action_items;
CREATE TRIGGER trg_action_items_updated_at
  BEFORE UPDATE ON public.client_action_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_action_item_updated_at();