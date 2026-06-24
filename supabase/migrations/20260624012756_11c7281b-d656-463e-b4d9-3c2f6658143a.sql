
-- Lookup values
INSERT INTO public.dd_kpi_ticket_platform (value, label, sort_order, is_active) VALUES
  ('complyhub_ai', 'ComplyHub AI', 20, true)
ON CONFLICT (value) DO NOTHING;
UPDATE public.dd_kpi_ticket_platform SET label = 'Unicorn CMS' WHERE value = 'unicorn';

INSERT INTO public.dd_kpi_ticket_priority (value, label, sort_order, is_active) VALUES
  ('standard', 'Standard', 30, true)
ON CONFLICT (value) DO NOTHING;

INSERT INTO public.dd_kpi_ticket_status (value, label, sort_order, is_active) VALUES
  ('received', 'Received', 5, true),
  ('under_review', 'Under Review', 15, true),
  ('solved', 'Solved', 35, true)
ON CONFLICT (value) DO NOTHING;

INSERT INTO public.dd_kpi_ticket_comm_type (value, label, sort_order, is_active) VALUES
  ('received_ack', 'Received acknowledgement', 10, true),
  ('in_progress_notify', 'In-progress notification', 20, true),
  ('reopened_notify', 'Reopened notification', 30, true),
  ('resolved_notify', 'Resolved notification', 40, true)
ON CONFLICT (value) DO NOTHING;

-- Counter table for ticket numbers
CREATE TABLE IF NOT EXISTS public.kpi_ticket_number_counters (
  year integer NOT NULL,
  platform text NOT NULL,
  last_seq integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (year, platform)
);
GRANT SELECT ON public.kpi_ticket_number_counters TO authenticated;
GRANT ALL ON public.kpi_ticket_number_counters TO service_role;
ALTER TABLE public.kpi_ticket_number_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kpi_ticket_number_counters staff read" ON public.kpi_ticket_number_counters;
CREATE POLICY "kpi_ticket_number_counters staff read" ON public.kpi_ticket_number_counters
  FOR SELECT TO authenticated USING (public.is_vivacity_team_safe(auth.uid()));

-- RPC to allocate next ticket number atomically
CREATE OR REPLACE FUNCTION public.next_kpi_ticket_number(p_platform text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_year integer := extract(year from now())::int;
  v_prefix text;
  v_seq integer;
BEGIN
  IF p_platform = 'unicorn' THEN v_prefix := 'UNI';
  ELSIF p_platform = 'complyhub_ai' THEN v_prefix := 'CHA';
  ELSE v_prefix := upper(substr(p_platform,1,3));
  END IF;

  INSERT INTO public.kpi_ticket_number_counters(year, platform, last_seq)
    VALUES (v_year, p_platform, 1)
  ON CONFLICT (year, platform) DO UPDATE
    SET last_seq = public.kpi_ticket_number_counters.last_seq + 1,
        updated_at = now()
  RETURNING last_seq INTO v_seq;

  RETURN v_prefix || '-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.next_kpi_ticket_number(text) TO authenticated;

-- Staff write policies on tickets and comms
DROP POLICY IF EXISTS "kpi_tickets staff insert" ON public.kpi_tickets;
CREATE POLICY "kpi_tickets staff insert" ON public.kpi_tickets
  FOR INSERT TO authenticated WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

DROP POLICY IF EXISTS "kpi_tickets staff update" ON public.kpi_tickets;
CREATE POLICY "kpi_tickets staff update" ON public.kpi_tickets
  FOR UPDATE TO authenticated
  USING (public.is_vivacity_team_safe(auth.uid()))
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

DROP POLICY IF EXISTS "kpi_ticket_comms staff insert" ON public.kpi_ticket_comms;
CREATE POLICY "kpi_ticket_comms staff insert" ON public.kpi_ticket_comms
  FOR INSERT TO authenticated WITH CHECK (public.is_vivacity_team_safe(auth.uid()));
