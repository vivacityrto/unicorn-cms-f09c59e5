
-- Replace the recalc trigger function to use the canonical fn_package_used_minutes() helper
-- (allocations-aware) instead of a raw time_entries.package_instance_id-only sum, and keep the
-- own+parent rollup behaviour.
create or replace function public.tg_recalc_package_hours_used()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_affected bigint[] := ARRAY[]::bigint[];
  v_parent   bigint;
  v_id       bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.package_instance_id IS NOT NULL THEN
      v_affected := ARRAY[NEW.package_instance_id];
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.package_instance_id IS NOT NULL THEN
      v_affected := ARRAY[OLD.package_instance_id];
    END IF;
  ELSE -- UPDATE
    IF NEW.package_instance_id IS NOT NULL THEN
      v_affected := array_append(v_affected, NEW.package_instance_id);
    END IF;
    IF OLD.package_instance_id IS NOT NULL
       AND OLD.package_instance_id IS DISTINCT FROM NEW.package_instance_id THEN
      v_affected := array_append(v_affected, OLD.package_instance_id);
    END IF;
  END IF;

  IF array_length(v_affected, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  FOREACH v_id IN ARRAY v_affected LOOP
    UPDATE public.package_instances pi
    SET hours_used = (
      public.fn_package_used_minutes(pi.id)
      + COALESCE((
          SELECT SUM(public.fn_package_used_minutes(child.id))
          FROM public.package_instances child
          WHERE child.parent_instance_id = pi.id
        ), 0)
    ) / 60.0
    WHERE pi.id = v_id;

    SELECT parent_instance_id INTO v_parent
    FROM public.package_instances WHERE id = v_id;

    IF v_parent IS NOT NULL THEN
      UPDATE public.package_instances pi
      SET hours_used = (
        public.fn_package_used_minutes(pi.id)
        + COALESCE((
            SELECT SUM(public.fn_package_used_minutes(child.id))
            FROM public.package_instances child
            WHERE child.parent_instance_id = pi.id
          ), 0)
      ) / 60.0
      WHERE pi.id = v_parent;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$function$;

-- New: also recalc when time_entry_allocations changes (reallocation doesn't always touch
-- time_entries.package_instance_id, so it needs its own trigger to keep hours_used correct).
create or replace function public.tg_recalc_package_hours_used_from_allocation()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
DECLARE
  v_affected bigint[] := ARRAY[]::bigint[];
  v_id bigint;
  v_parent bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.package_instance_id IS NOT NULL THEN
      v_affected := ARRAY[OLD.package_instance_id];
    END IF;
  ELSE
    IF NEW.package_instance_id IS NOT NULL THEN
      v_affected := array_append(v_affected, NEW.package_instance_id);
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.package_instance_id IS NOT NULL
       AND OLD.package_instance_id IS DISTINCT FROM NEW.package_instance_id THEN
      v_affected := array_append(v_affected, OLD.package_instance_id);
    END IF;
  END IF;

  IF array_length(v_affected, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  FOREACH v_id IN ARRAY v_affected LOOP
    UPDATE public.package_instances pi
    SET hours_used = (
      public.fn_package_used_minutes(pi.id)
      + COALESCE((
          SELECT SUM(public.fn_package_used_minutes(child.id))
          FROM public.package_instances child
          WHERE child.parent_instance_id = pi.id
        ), 0)
    ) / 60.0
    WHERE pi.id = v_id;

    SELECT parent_instance_id INTO v_parent FROM public.package_instances WHERE id = v_id;
    IF v_parent IS NOT NULL THEN
      UPDATE public.package_instances pi
      SET hours_used = (
        public.fn_package_used_minutes(pi.id)
        + COALESCE((
            SELECT SUM(public.fn_package_used_minutes(child.id))
            FROM public.package_instances child
            WHERE child.parent_instance_id = pi.id
          ), 0)
      ) / 60.0
      WHERE pi.id = v_parent;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$function$;

drop trigger if exists trg_recalc_package_hours_used_from_allocation on public.time_entry_allocations;
create trigger trg_recalc_package_hours_used_from_allocation
after insert or delete or update of allocated_minutes, package_instance_id
on public.time_entry_allocations
for each row execute function public.tg_recalc_package_hours_used_from_allocation();
