-- Add is_pinned column with default false
ALTER TABLE public.notes 
ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

-- Add tags array column with empty default
ALTER TABLE public.notes 
ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

-- Index for parent type + id lookups (core polymorphic query)
CREATE INDEX IF NOT EXISTS idx_notes_parent_type_id 
ON public.notes (parent_type, parent_id);

-- Index for pinned notes per tenant (ordered by update time)
CREATE INDEX IF NOT EXISTS idx_notes_pinned 
ON public.notes (tenant_id, is_pinned DESC, updated_at DESC)
WHERE is_pinned = true;

-- GIN index for tag searches
CREATE INDEX IF NOT EXISTS idx_notes_tags 
ON public.notes USING gin (tags);

-- Index for note type filtering
CREATE INDEX IF NOT EXISTS idx_notes_type 
ON public.notes (tenant_id, note_type);

-- Enable RLS
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- Read policy: Users can read notes for tenants they belong to
CREATE POLICY notes_tenant_read ON public.notes
FOR SELECT USING (
  tenant_id IN (
    SELECT tenant_id FROM public.tenant_users 
    WHERE user_uuid = auth.uid()
  )
);

-- Insert policy: Authenticated users can create notes for their tenants
CREATE POLICY notes_tenant_insert ON public.notes
FOR INSERT WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM public.tenant_users 
    WHERE user_uuid = auth.uid()
  )
  AND created_by = auth.uid()
);

-- Update policy: Users can update notes they created or are admins
CREATE POLICY notes_tenant_update ON public.notes
FOR UPDATE USING (
  created_by = auth.uid() 
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_users 
    WHERE user_uuid = auth.uid() 
    AND role IN ('admin', 'superadmin')
  )
);

-- Delete policy: Users can delete notes they created or are admins
CREATE POLICY notes_tenant_delete ON public.notes
FOR DELETE USING (
  created_by = auth.uid() 
  OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_users 
    WHERE user_uuid = auth.uid() 
    AND role IN ('admin', 'superadmin')
  )
);