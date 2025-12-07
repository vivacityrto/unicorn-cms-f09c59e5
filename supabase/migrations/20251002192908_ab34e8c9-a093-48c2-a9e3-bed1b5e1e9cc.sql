-- Update the Super Admin user to have the correct tenant_id
UPDATE users 
SET tenant_id = 319
WHERE user_uuid = '384cf51f-87f5-479b-a9c4-a2293be84e3a';

-- Ensure tenant_id has a proper foreign key constraint if not already present
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'users_tenant_id_fkey' 
    AND table_name = 'users'
  ) THEN
    ALTER TABLE users
    ADD CONSTRAINT users_tenant_id_fkey 
    FOREIGN KEY (tenant_id) 
    REFERENCES tenants(id) 
    ON DELETE SET NULL;
  END IF;
END $$;