-- 2026-08-11 seat-health-recommendation-race
-- Same bug class as client_audit_responses (see 20260811051202): generateRecommendations()
-- in useSeatHealth.tsx does a manual "check if an active recommendation of this
-- type already exists via .maybeSingle(), then insert if not" with no error
-- check and no backing constraint. Currently unreachable from any live page
-- (SeatHealthWatchlist.tsx, the only caller of calculateAllHealth, has no
-- importers anywhere in src/) so no duplicates exist yet, but fixing before
-- it's wired into a page.
--
-- Unlike client_audit_responses, "duplicate" here is intentionally scoped to
-- *active* recommendations only (status new/acknowledged) — a resolved or
-- dismissed recommendation of the same type legitimately recurring later is
-- not a duplicate. A plain UNIQUE(seat_id, recommendation_type) would wrongly
-- block that, so this uses a partial unique index instead.
create unique index if not exists seat_rebalancing_recommendations_active_uniq
  on public.seat_rebalancing_recommendations (seat_id, recommendation_type)
  where status in ('new', 'acknowledged');

-- Atomic "insert unless an active one already exists" — a single statement,
-- not a separate check-then-write, so it can't race. security invoker: runs
-- as the calling role, so existing RLS on the table still applies exactly as
-- it does for a direct insert.
create or replace function public.insert_seat_recommendation_if_absent(
  p_tenant_id integer,
  p_seat_id uuid,
  p_recommendation_type text,
  p_title text,
  p_description text,
  p_severity text,
  p_trigger_type text,
  p_quarter_year integer,
  p_quarter_number integer
) returns uuid
language sql
security invoker
set search_path = public
as $$
  insert into seat_rebalancing_recommendations (
    tenant_id, seat_id, recommendation_type, title, description,
    status, severity, trigger_type, quarter_year, quarter_number
  ) values (
    p_tenant_id, p_seat_id, p_recommendation_type, p_title, p_description,
    'new', p_severity, p_trigger_type, p_quarter_year, p_quarter_number
  )
  on conflict (seat_id, recommendation_type) where status in ('new', 'acknowledged')
  do nothing
  returning id;
$$;

grant execute on function public.insert_seat_recommendation_if_absent(
  integer, uuid, text, text, text, text, text, integer, integer
) to authenticated;
