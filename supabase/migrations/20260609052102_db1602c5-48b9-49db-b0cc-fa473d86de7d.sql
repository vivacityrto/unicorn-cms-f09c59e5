
-- =========================================================
-- Migration A: Seed 4 new internal roles into dd_unicorn_roles
-- =========================================================

-- ---- Pre-flight assertions -------------------------------
DO $$
DECLARE
  v_role_count        integer;
  v_bad_internal      integer;
  v_existing_new      integer;
BEGIN
  SELECT count(*) INTO v_role_count FROM public.dd_unicorn_roles;
  IF v_role_count <> 6 THEN
    RAISE EXCEPTION 'Migration A pre-flight: expected 6 rows, found %', v_role_count;
  END IF;

  SELECT count(*) INTO v_bad_internal
  FROM public.users
  WHERE user_type = 'Vivacity Team' AND is_vivacity_internal = false;
  IF v_bad_internal <> 0 THEN
    RAISE EXCEPTION 'Migration A pre-flight: % Vivacity Team users have is_vivacity_internal=false', v_bad_internal;
  END IF;

  SELECT count(*) INTO v_existing_new
  FROM public.dd_unicorn_roles
  WHERE value IN ('Integrator','BGT','CSC','CET');
  IF v_existing_new <> 0 THEN
    RAISE EXCEPTION 'Migration A pre-flight: % new role codes already exist', v_existing_new;
  END IF;
END $$;

-- ---- 1. Add is_internal column ---------------------------
ALTER TABLE public.dd_unicorn_roles
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

-- ---- 2. Backfill is_internal -----------------------------
UPDATE public.dd_unicorn_roles SET is_internal = true
  WHERE value IN ('Super Admin','Team Leader','Team Member');
UPDATE public.dd_unicorn_roles SET is_internal = false
  WHERE value IN ('Admin','User','Academy User');

-- ---- 3. Renumber sort_order via offset to avoid collisions
-- Push ALL existing rows out of the 1..10 range first.
UPDATE public.dd_unicorn_roles SET sort_order = sort_order + 100;

-- Final positions:
UPDATE public.dd_unicorn_roles SET sort_order = 1  WHERE value = 'Super Admin';
UPDATE public.dd_unicorn_roles SET sort_order = 2  WHERE value = 'Team Leader';
UPDATE public.dd_unicorn_roles SET sort_order = 7  WHERE value = 'Team Member';
UPDATE public.dd_unicorn_roles SET sort_order = 8  WHERE value = 'Admin';
UPDATE public.dd_unicorn_roles SET sort_order = 9  WHERE value = 'User';
UPDATE public.dd_unicorn_roles SET sort_order = 10 WHERE value = 'Academy User';

-- ---- 4. Insert the 4 new internal roles ------------------
INSERT INTO public.dd_unicorn_roles
  (value, label, description, is_active, is_internal, sort_order)
VALUES
  ('Integrator', 'Vivacity Integrator',     'Vivacity Integrator — internal staff role.',     true, true, 3),
  ('BGT',        'Business Growth Team',    'Business Growth Team — internal staff role.',    true, true, 4),
  ('CSC',        'Client Success Champion', 'Client Success Champion — internal staff role.', true, true, 5),
  ('CET',        'Client Experience Team',  'Client Experience Team — internal staff role.',  true, true, 6);

-- ---- Post-flight assertions ------------------------------
DO $$
DECLARE
  v_total      integer;
  v_internal   integer;
  v_distinct   integer;
  v_max        integer;
  v_min        integer;
BEGIN
  SELECT count(*) INTO v_total FROM public.dd_unicorn_roles;
  IF v_total <> 10 THEN
    RAISE EXCEPTION 'Migration A post-flight: expected 10 rows, found %', v_total;
  END IF;

  SELECT count(*) INTO v_internal FROM public.dd_unicorn_roles WHERE is_internal = true;
  IF v_internal <> 7 THEN
    RAISE EXCEPTION 'Migration A post-flight: expected 7 internal roles, found %', v_internal;
  END IF;

  SELECT count(DISTINCT sort_order), min(sort_order), max(sort_order)
    INTO v_distinct, v_min, v_max
  FROM public.dd_unicorn_roles;
  IF v_distinct <> 10 OR v_min <> 1 OR v_max <> 10 THEN
    RAISE EXCEPTION
      'Migration A post-flight: sort_order must be 1..10 unique; distinct=%, min=%, max=%',
      v_distinct, v_min, v_max;
  END IF;
END $$;
