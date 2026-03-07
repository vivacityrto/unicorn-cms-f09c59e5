INSERT INTO dd_status (code, value, description, seq)
VALUES (6, 'monitor', 'Monitor', 60)
ON CONFLICT (code) DO NOTHING;