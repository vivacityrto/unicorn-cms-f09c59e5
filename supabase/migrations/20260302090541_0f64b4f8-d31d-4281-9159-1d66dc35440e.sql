INSERT INTO dd_status (code, value, description, seq)
VALUES
  (4, 'core_complete', 'Core Complete', 0),
  (5, 'blocked', 'Blocked', 0)
ON CONFLICT DO NOTHING;