-- Delete duplicate pending invitations, keeping only the most recent per email/tenant
DELETE FROM user_invitations ui1
WHERE status = 'pending'
  AND EXISTS (
    SELECT 1 FROM user_invitations ui2
    WHERE LOWER(ui2.email) = LOWER(ui1.email)
      AND ui2.tenant_id = ui1.tenant_id
      AND ui2.status = 'pending'
      AND ui2.created_at > ui1.created_at
  );

-- Create unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_invitations_unique_pending 
ON user_invitations (LOWER(email), tenant_id) 
WHERE status = 'pending';