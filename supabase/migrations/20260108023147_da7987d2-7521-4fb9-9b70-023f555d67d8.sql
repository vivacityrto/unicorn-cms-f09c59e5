-- Add foreign key from tenant_members.user_id to users.user_uuid
-- This enables PostgREST joins between tenant_members and users tables

-- First ensure users.user_uuid has a unique constraint (if not already primary key)
DO $$ 
BEGIN
  -- Check if primary key or unique constraint already exists on user_uuid
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.users'::regclass 
    AND contype IN ('p', 'u')
    AND array_to_string(conkey, ',') = (
      SELECT attnum::text FROM pg_attribute 
      WHERE attrelid = 'public.users'::regclass 
      AND attname = 'user_uuid'
    )
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_user_uuid_unique UNIQUE (user_uuid);
  END IF;
END $$;

-- Add foreign key constraint from tenant_members to users
ALTER TABLE public.tenant_members
  ADD CONSTRAINT tenant_members_user_id_users_fkey 
  FOREIGN KEY (user_id) 
  REFERENCES public.users(user_uuid) 
  ON DELETE CASCADE;