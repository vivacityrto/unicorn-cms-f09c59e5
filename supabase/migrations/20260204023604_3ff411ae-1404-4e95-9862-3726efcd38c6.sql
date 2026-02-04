-- Fix VTO records that were saved with null tenant_id
-- These should be associated with the Vivacity system tenant (6372)
UPDATE eos_vto 
SET tenant_id = 6372 
WHERE tenant_id IS NULL;