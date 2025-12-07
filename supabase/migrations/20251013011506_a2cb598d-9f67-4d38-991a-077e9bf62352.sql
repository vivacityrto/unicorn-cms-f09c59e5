-- Add status column to tenant_members if it doesn't exist
-- This fixes the PGRST204 error for missing status column

DO $$ 
BEGIN
    -- Add status column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'tenant_members' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE public.tenant_members 
        ADD COLUMN status text NOT NULL DEFAULT 'active' 
        CHECK (status IN ('active', 'suspended', 'pending'));
        
        COMMENT ON COLUMN public.tenant_members.status IS 'Member status: active, suspended, or pending invitation';
    END IF;

    -- Ensure role column exists with proper constraints
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'tenant_members' 
        AND column_name = 'role'
    ) THEN
        ALTER TABLE public.tenant_members 
        ADD COLUMN role text NOT NULL DEFAULT 'User';
        
        COMMENT ON COLUMN public.tenant_members.role IS 'Member role in the tenant organization';
    END IF;
END $$;