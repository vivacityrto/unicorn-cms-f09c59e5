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
    const { data: rev } = await (supabase as any)
      .from("kpi_reviews")
      .select("*")
      .eq("subject_uuid", subjectUuid)
      .eq("kpi_role", role)
      .eq("period_type", periodType)
      .eq("period_start", periodStart)
      .maybeSingle();
    setReview((rev as KpiReview | null) ?? null);

    if (rev?.id) {
      const { data: so } = await (supabase as any)
        .from("kpi_review_signoffs")
        .select("*")
        .eq("review_id", rev.id)
        .order("signed_at", { ascending: true });
      setSignoffs((so as KpiReviewSignoff[]) ?? []);
    } else {
      setSignoffs([]);
    }

    const { data: comp } = await (supabase as any).rpc("compute_kpi_overall_status", {
      p_kpi_role: role,
      p_subject_uuid: subjectUuid,
      p_period_start: periodStart,
      p_period_end: periodEnd,
    });
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
    const { data, error } = await (supabase as any).rpc("upsert_kpi_review", {
      p_subject_uuid: subjectUuid,
      p_kpi_role: role,
      p_period_type: periodType,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_notes: notes,
    });
    setBusy(false);
    if (error) throw error;
    await load();
    return data as KpiReview;
  }, [subjectUuid, role, periodType, periodStart, periodEnd, load]);

  const signOff = useCallback(async (signoffType: string, comment: string) => {
    if (!review || !user?.id) return;
    setBusy(true);
    const { error } = await (supabase as any).from("kpi_review_signoffs").insert({
      review_id: review.id,
      reviewer_user_id: user.id,
      signoff_type: signoffType,
      comment: comment || null,
    });
    setBusy(false);
    if (error) throw error;
    await load();
  }, [review, user?.id, load]);

  const lock = useCallback(async () => {
    if (!review) return;
    setBusy(true);
    const { error } = await (supabase as any)
      .from("kpi_reviews")
      .update({ locked_at: new Date().toISOString() })
      .eq("id", review.id);
    setBusy(false);
    if (error) throw error;
    await load();
  }, [review, load]);

  return { review, signoffs, previewStatus, previewMetrics, loading, busy, save, signOff, lock, reload: load };
}
