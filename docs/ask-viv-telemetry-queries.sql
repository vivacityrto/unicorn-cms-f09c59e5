-- Ask Viv Quality Telemetry - Aggregation Queries
-- These queries are for internal tuning and governance review.
-- Run against the ai_quality_events table.
-- 
-- Access: Vivacity internal roles only (enforced by RLS)
-- Updated: 2026-02-09

--------------------------------------------------------------------------------
-- 1. Blocks by category (last 30 days)
-- Shows which block categories are most common
--------------------------------------------------------------------------------
SELECT 
  unnest(block_categories) AS category, 
  count(*) AS cnt
FROM public.ai_quality_events
WHERE occurred_at > now() - interval '30 days'
GROUP BY category
ORDER BY cnt DESC;

--------------------------------------------------------------------------------
-- 2. Repair rate (last 30 days)
-- Shows how often the validator repair pipeline is triggered
--------------------------------------------------------------------------------
SELECT
  count(*) FILTER (WHERE repaired) AS repaired_count,
  count(*) AS total,
  round(100.0 * count(*) FILTER (WHERE repaired) / nullif(count(*), 0), 2) AS repair_rate_pct
FROM public.ai_quality_events
WHERE occurred_at > now() - interval '30 days';

--------------------------------------------------------------------------------
-- 3. Confidence distribution (last 30 days)
-- Shows the distribution of final (post-gating) confidence levels
--------------------------------------------------------------------------------
SELECT 
  confidence, 
  count(*) AS cnt,
  round(100.0 * count(*) / sum(count(*)) OVER (), 2) AS pct
FROM public.ai_quality_events
WHERE occurred_at > now() - interval '30 days'
  AND confidence IS NOT NULL
GROUP BY confidence
ORDER BY cnt DESC;

--------------------------------------------------------------------------------
-- 4. Top gap keys (last 30 days)
-- Shows the most common standardised gap keys
--------------------------------------------------------------------------------
SELECT 
  unnest(gap_keys) AS gap_key, 
  count(*) AS cnt
FROM public.ai_quality_events
WHERE occurred_at > now() - interval '30 days'
GROUP BY gap_key
ORDER BY cnt DESC;

--------------------------------------------------------------------------------
-- 5. Block rate by mode (last 30 days)
-- Compares block rates between knowledge and compliance modes
--------------------------------------------------------------------------------
SELECT
  mode,
  count(*) AS total,
  count(*) FILTER (WHERE blocked) AS blocked_count,
  round(100.0 * count(*) FILTER (WHERE blocked) / nullif(count(*), 0), 2) AS block_rate_pct
FROM public.ai_quality_events
WHERE occurred_at > now() - interval '30 days'
GROUP BY mode
ORDER BY mode;

--------------------------------------------------------------------------------
-- 6. Intent distribution (last 30 days)
-- Shows which intents are being classified
--------------------------------------------------------------------------------
SELECT 
  intent,
  count(*) AS cnt,
  count(*) FILTER (WHERE blocked) AS blocked_cnt,
  round(100.0 * count(*) FILTER (WHERE blocked) / nullif(count(*), 0), 2) AS block_rate_pct
FROM public.ai_quality_events
WHERE occurred_at > now() - interval '30 days'
  AND intent IS NOT NULL
GROUP BY intent
ORDER BY cnt DESC;

--------------------------------------------------------------------------------
-- 7. Daily event volume (last 30 days)
-- Shows telemetry volume trends
--------------------------------------------------------------------------------
SELECT 
  date_trunc('day', occurred_at) AS day,
  count(*) AS total,
  count(*) FILTER (WHERE blocked) AS blocked,
  count(*) FILTER (WHERE repaired) AS repaired
FROM public.ai_quality_events
WHERE occurred_at > now() - interval '30 days'
GROUP BY day
ORDER BY day DESC;

--------------------------------------------------------------------------------
-- 8. Freshness impact on confidence (last 30 days)
-- Shows how data freshness affects confidence distribution
--------------------------------------------------------------------------------
SELECT 
  meta->>'freshness_status' AS freshness_status,
  confidence,
  count(*) AS cnt,
  count(*) FILTER (WHERE (meta->>'confidence_downgraded')::boolean = true) AS downgraded_count
FROM public.ai_quality_events
WHERE occurred_at > now() - interval '30 days'
  AND meta->>'freshness_status' IS NOT NULL
GROUP BY freshness_status, confidence
ORDER BY freshness_status, cnt DESC;

--------------------------------------------------------------------------------
-- 9. Phrase filter category breakdown (last 30 days)
-- Detailed view of which phrase filter categories are triggering
--------------------------------------------------------------------------------
SELECT 
  unnest(block_categories) AS category,
  count(*) AS cnt
FROM public.ai_quality_events
WHERE occurred_at > now() - interval '30 days'
  AND blocked = true
  AND array_length(block_categories, 1) > 0
GROUP BY category
HAVING unnest(block_categories) LIKE 'phrase_filter_%'
ORDER BY cnt DESC;

--------------------------------------------------------------------------------
-- 10. Events with multiple block categories (last 30 days)
-- Identifies responses that triggered multiple safety checks
--------------------------------------------------------------------------------
SELECT 
  array_length(block_categories, 1) AS category_count,
  count(*) AS cnt
FROM public.ai_quality_events
WHERE occurred_at > now() - interval '30 days'
  AND blocked = true
GROUP BY category_count
ORDER BY category_count;
