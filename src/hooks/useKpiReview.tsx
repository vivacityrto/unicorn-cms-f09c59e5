import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { KpiRole } from "./useKpiSummary";

export type PeriodType = "monthly" | "quarterly" | "annual";
export type OverallStatus = "exceeds" | "on_track" | "at_risk" | "off_track";

export interface KpiReview {
  id: number;
  subject_uuid: string;
  kpi_role: KpiRole;
  period_type: PeriodType;
  period_start: string;
  period_end: string;
  overall_status: OverallStatus | null;
  metrics: Record<string, unknown>;
  notes: string | null;
  locked_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface KpiReviewSignoff {
  id: number;
  review_id: number;
  reviewer_user_id: string;
  signoff_type: string;
  signed_at: string;
  comment: string | null;
}

interface Params {
  subjectUuid: string | null;
  role: KpiRole;
  periodType: PeriodType;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;
}

type SupabaseResult<T> = { data: T | null; error: Error | null };

const ROLE_TO_DD: Record<KpiRole, string> = {
  csc: "csc_consultant",
  cst: "cst_assistant",
  dev: "developer",
};

export function useKpiReview({ subjectUuid, role, periodType, periodStart, periodEnd }: Params) {
  const { user } = useAuth();
  const [review, setReview] = useState<KpiReview | null>(null);
  const [signoffs, setSignoffs] = useState<KpiReviewSignoff[]>([]);
  const [previewStatus, setPreviewStatus] = useState<OverallStatus | null>(null);
  const [previewMetrics, setPreviewMetrics] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!subjectUuid) {
      setReview(null);
      setSignoffs([]);
      setPreviewStatus(null);
      setPreviewMetrics({});
      return;
    }
    setLoading(true);
    const ddRole = ROLE_TO_DD[role];
    const { data: rev } = await (supabase
      .from("kpi_reviews" as never)
      .select("*")
      .eq("subject_uuid", subjectUuid)
      .eq("kpi_role", ddRole)
      .eq("period_type", periodType)
      .eq("period_start", periodStart)
      .maybeSingle() as unknown as Promise<SupabaseResult<KpiReview>>);
    setReview((rev as KpiReview | null) ?? null);

    if (rev?.id) {
      const { data: so } = await (supabase
        .from("kpi_review_signoffs" as never)
        .select("*")
        .eq("review_id", rev.id)
        .order("signed_at", { ascending: true }) as unknown as Promise<SupabaseResult<KpiReviewSignoff[]>>);
      setSignoffs((so as KpiReviewSignoff[]) ?? []);
    } else {
      setSignoffs([]);
    }

    const { data: comp } = await (supabase.rpc("compute_kpi_overall_status" as never, {
      p_kpi_role: ddRole,
      p_subject_uuid: subjectUuid,
      p_period_start: periodStart,
      p_period_end: periodEnd,
    } as never) as unknown as SupabaseResult<Array<{ overall_status: OverallStatus | null; metrics: Record<string, unknown> }> | { overall_status: OverallStatus | null; metrics: Record<string, unknown> }>);
    const first = Array.isArray(comp) ? comp[0] : comp;
    setPreviewStatus((first?.overall_status as OverallStatus | null) ?? null);
    setPreviewMetrics((first?.metrics as Record<string, unknown>) ?? {});
    setLoading(false);
  }, [subjectUuid, role, periodType, periodStart, periodEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async (notes: string) => {
    if (!subjectUuid) return null;
    setBusy(true);
    const { data, error } = await (supabase.rpc("upsert_kpi_review" as never, {
      p_subject_uuid: subjectUuid,
      p_kpi_role: ROLE_TO_DD[role],
      p_period_type: periodType,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_notes: notes,
    } as never) as unknown as SupabaseResult<KpiReview>);
    setBusy(false);
    if (error) throw error;
    await load();
    return data as KpiReview;
  }, [subjectUuid, role, periodType, periodStart, periodEnd, load]);


  const signOff = useCallback(async (signoffType: string, comment: string) => {
    if (!review || !user?.id) return;
    setBusy(true);
    const { error } = await (supabase.from("kpi_review_signoffs" as never).insert({
      review_id: review.id,
      reviewer_user_id: user.id,
      signoff_type: signoffType,
      comment: comment || null,
    } as never) as unknown as SupabaseResult<null>);
    setBusy(false);
    if (error) throw error;
    await load();
  }, [review, user?.id, load]);

  const lock = useCallback(async () => {
    if (!review) return;
    setBusy(true);
    const { error } = await (supabase
      .from("kpi_reviews" as never)
      .update({ locked_at: new Date().toISOString() } as never)
      .eq("id", review.id) as unknown as Promise<SupabaseResult<null>>);
    setBusy(false);
    if (error) throw error;
    await load();
  }, [review, load]);

  return { review, signoffs, previewStatus, previewMetrics, loading, busy, save, signOff, lock, reload: load };
}
