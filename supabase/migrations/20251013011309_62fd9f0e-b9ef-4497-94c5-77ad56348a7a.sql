-- Add invited_at column to tenant_members if it doesn't exist
-- This fixes the PGRST204 error when inviting users

DO $$ 
BEGIN
    -- Add invited_at column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'tenant_members' 
        AND column_name = 'invited_at'
    ) THEN
        ALTER TABLE public.tenant_members 
        ADD COLUMN invited_at timestamp with time zone DEFAULT now();
        
        COMMENT ON COLUMN public.tenant_members.invited_at IS 'Timestamp when the user was invited to the tenant';
    END IF;

    -- Ensure joined_at column exists (for when user accepts invite)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'tenant_members' 
        AND column_name = 'joined_at'
    ) THEN
        ALTER TABLE public.tenant_members 
        ADD COLUMN joined_at timestamp with time zone;
        
        COMMENT ON COLUMN public.tenant_members.joined_at IS 'Timestamp when the user accepted the invitation and joined the tenant';
    END IF;
END $$;