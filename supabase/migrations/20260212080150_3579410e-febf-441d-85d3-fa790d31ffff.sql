-- Create a sequence for tenants.id starting after the current max
CREATE SEQUENCE IF NOT EXISTS tenants_id_seq;
SELECT setval('tenants_id_seq', (SELECT COALESCE(max(id), 0) FROM tenants));
ALTER TABLE tenants ALTER COLUMN id SET DEFAULT nextval('tenants_id_seq');