-- Bulk update framework_type based on category patterns
-- GTO categories
UPDATE documents SET framework_type = 'GTO' WHERE category LIKE 'gto-%' AND (framework_type IS NULL OR framework_type != 'GTO');

-- CRICOS categories
UPDATE documents SET framework_type = 'CRICOS' WHERE category LIKE 'cricos-%' AND (framework_type IS NULL OR framework_type != 'CRICOS');

-- RTO categories: q1-q4, cp-, cr-, rto_
UPDATE documents SET framework_type = 'RTO' WHERE (
  category LIKE 'q1-%' OR category LIKE 'q2-%' OR category LIKE 'q3-%' OR category LIKE 'q4-%'
  OR category LIKE 'cp-%' OR category LIKE 'cr-%'
  OR category LIKE 'rto_%'
) AND (framework_type IS NULL OR framework_type != 'RTO');