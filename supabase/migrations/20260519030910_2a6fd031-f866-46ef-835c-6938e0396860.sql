CREATE OR REPLACE VIEW public.v_client_eos_summary AS
SELECT
  t.id AS tenant_id,
  t.name AS client_name,
  (SELECT count(*) FROM eos_rocks er WHERE er.tenant_id = t.id) AS total_rocks,
  (SELECT count(*) FROM eos_rocks er WHERE er.tenant_id = t.id AND er.status = 'on_track') AS rocks_on_track,
  (SELECT count(*) FROM eos_rocks er WHERE er.tenant_id = t.id AND er.status = 'off_track') AS rocks_off_track,
  (SELECT count(*) FROM eos_rocks er WHERE er.tenant_id = t.id AND er.status = 'complete') AS rocks_completed,
  (SELECT count(*) FROM eos_issues ei WHERE ei.tenant_id = t.id AND ei.deleted_at IS NULL) AS total_issues,
  (SELECT count(*) FROM eos_issues ei WHERE ei.tenant_id = t.id AND ei.status::text = 'Open' AND ei.deleted_at IS NULL) AS open_issues,
  (SELECT count(*) FROM eos_issues ei WHERE ei.tenant_id = t.id AND ei.status::text = 'Solved' AND ei.deleted_at IS NULL) AS solved_issues,
  (SELECT count(*) FROM eos_issues ei WHERE ei.tenant_id = t.id AND ei.item_type = 'Risk' AND ei.deleted_at IS NULL) AS risk_count,
  (SELECT count(*) FROM eos_issues ei WHERE ei.tenant_id = t.id AND ei.item_type = 'Opportunity' AND ei.deleted_at IS NULL) AS opportunity_count,
  (SELECT count(*) FROM eos_todos et WHERE et.tenant_id = t.id) AS total_todos,
  (SELECT count(*) FROM eos_todos et WHERE et.tenant_id = t.id AND et.status = 'Complete') AS completed_todos,
  (SELECT count(*) FROM eos_meetings em WHERE em.tenant_id = t.id) AS total_meetings,
  (SELECT count(*) FROM eos_meetings em WHERE em.tenant_id = t.id AND em.is_complete = true) AS completed_meetings
FROM tenants t;