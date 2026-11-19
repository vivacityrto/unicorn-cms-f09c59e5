-- Remove untouched legacy package enrolments in two internal tenants.
--
-- Until 24 September 2026 assigning a package created a real academy_enrollments row (source 'auto_package') for every
-- user at the client. That mechanism was replaced by tenant-level entitlements (20260924031412), so the rows left behind
-- are courses nobody chose. In the two internal tenants below they only clutter "My courses" and inflate counts.
--
-- Scope, deliberately narrow:
--   * tenants 6372 (Vivacity Coaching & Consulting) and 7547 (Demo RTO) only; real client tenants are NOT touched;
--   * source = 'auto_package', still active, never revoked, never completed;
--   * rows with ANY lesson progress, assessment attempt, certificate or PDP evidence are kept;
--   * no entitlement backfill: these are internal accounts and the courses stay in the catalogue by audience.
--
-- Everything runs in this one transaction. If the live counts differ from what was approved (440 rows), it raises and
-- nothing changes. The deleted rows are first copied, with every column, to a backup table used by the rollback.
-- Not touched: auto_all_clients (required training), self_enrol, staff_impersonation, client_timeline_events.

create table public._bak_academy_enrollments_legacy_auto_20261119 as
select * from public.academy_enrollments where false;

alter table public._bak_academy_enrollments_legacy_auto_20261119 enable row level security;
revoke all on table public._bak_academy_enrollments_legacy_auto_20261119 from anon, authenticated;

comment on table public._bak_academy_enrollments_legacy_auto_20261119 is
  'Backup of 440 untouched legacy auto_package enrolments removed from internal tenants 6372 and 7547 on 2026-11-19. Restore with rollback/20261119120000_academy_remove_untouched_legacy_package_enrolments_internal.down.sql. Safe to drop once the cleanup is signed off.';

do $$
declare
  v_expected constant integer := 440;
  v_backed   integer;
  v_deleted  integer;
  v_left     integer;
begin
  insert into public._bak_academy_enrollments_legacy_auto_20261119
  select e.*
  from public.academy_enrollments e
  where e.source = 'auto_package'
    and e.tenant_id in (6372, 7547)
    and e.status = 'active'
    and e.revoked_at is null
    and e.completed_at is null
    and not exists (select 1 from public.academy_lesson_progress lp where lp.enrollment_id = e.id)
    and not exists (select 1 from public.academy_assessment_attempts a where a.enrollment_id = e.id)
    and not exists (select 1 from public.academy_certificates c where c.enrollment_id = e.id)
    and not exists (select 1 from public.pdp_evidence_items p where p.source_enrollment_id = e.id);
  get diagnostics v_backed = row_count;

  if v_backed <> v_expected then
    raise exception 'Expected % untouched legacy enrolments in tenants 6372 and 7547 but found %. Nothing was changed.', v_expected, v_backed;
  end if;

  delete from public.academy_enrollments e
  using public._bak_academy_enrollments_legacy_auto_20261119 b
  where e.id = b.id;
  get diagnostics v_deleted = row_count;

  if v_deleted <> v_backed then
    raise exception 'Deleted % rows but backed up %. Nothing was changed.', v_deleted, v_backed;
  end if;

  select count(*) into v_left
  from public.academy_enrollments e
  where e.source = 'auto_package' and e.tenant_id in (6372, 7547);

  -- The four rows with real lesson progress stay.
  if v_left <> 4 then
    raise exception 'Expected 4 legacy enrolments with progress to remain in tenants 6372 and 7547 but found %. Nothing was changed.', v_left;
  end if;
end
$$;
