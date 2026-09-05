import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type KpiRole = "csc" | "cst" | "dev";

export interface CscSummaryRow {
  subject_uuid: string;
  period_start: string;
  period_type: string;
  email_total: number;
  email_sla_met: number;
  email_sla_pct: number;
  review_status: string | null;
  review_locked_at: string | null;
}


export interface CstSummaryRow {
  subject_uuid: string;
  period_start: string;
  period_type: string;
  sla1_total: number;
  sla1_met: number;
  sla1_pct: number;
  sla1_avg_minutes: number | null;
  sla2_total: number;
  sla2_met: number;
  sla2_pct: number;
  sla2_avg_minutes: number | null;
  tasks_total: number;
  tasks_completed: number;
  tasks_on_time: number;
  review_status: string | null;
  review_locked_at: string | null;
}

export interface DevSummaryRow {
  subject_uuid: string;
  period_start: string;
  period_type: string;
  tickets_opened: number;
  tickets_resolved: number;
  reopen_count: number;
  avg_first_response_minutes: number | null;
  avg_resolution_hours: number | null;
  milestones_total: number;
  milestones_delivered: number;
  milestones_on_time: number;
  review_status: string | null;
  review_locked_at: string | null;
}

type RowFor<R extends KpiRole> = R extends "csc"
  ? CscSummaryRow
  : R extends "cst"
  ? CstSummaryRow
  : DevSummaryRow;

const VIEW: Record<KpiRole, "v_kpi_csc_summary" | "v_kpi_cst_summary" | "v_kpi_dev_summary"> = {
  csc: "v_kpi_csc_summary",
  cst: "v_kpi_cst_summary",
  dev: "v_kpi_dev_summary",
};

export function useKpiSummary<R extends KpiRole>(role: R, subjectUuid: string | null | undefined, weeks = 12) {
  const [rows, setRows] = useState<RowFor<R>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!subjectUuid) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - weeks * 7);
      const { data, error } = await supabase
        .from(VIEW[role])
        .select("*")
        .eq("subject_uuid", subjectUuid)
        .gte("period_start", since.toISOString().slice(0, 10))
        .order("period_start", { ascending: false });
      if (cancelled) return;
      if (error) setError(error.message);
      setRows((data ?? []) as RowFor<R>[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [role, subjectUuid, weeks]);

  return { rows, loading, error };
}
