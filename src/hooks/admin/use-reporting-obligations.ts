import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export interface DdLookupRow {
  id: number;
  value: string;
  label: string;
  sort_order: number | null;
}

export interface ReportingObligationRow {
  id: number;
  code: string;
  title: string;
  description: string | null;
  audience_id: number;
  recurrence_id: number;
  annual_month: number | null;
  annual_day: number | null;
  window_opens_month: number | null;
  window_opens_day: number | null;
  due_date: string | null;
  cta_label: string | null;
  cta_url: string | null;
  sort_order: number | null;
  is_active: boolean;
  notification_message: string | null;
  lead_times: number[] | null;
  audience_value?: string;
  audience_label?: string;
  recurrence_value?: string;
  recurrence_label?: string;
}

export interface ReportingObligationInput {
  id?: number;
  code: string;
  title: string;
  description: string;
  audience_id: number;
  recurrence_id: number;
  annual_month: number | null;
  annual_day: number | null;
  window_opens_month: number | null;
  window_opens_day: number | null;
  due_date: string | null;
  cta_label: string;
  cta_url: string;
  sort_order: number;
  is_active: boolean;
  notification_message: string | null;
  lead_times: number[];
}

const QUERY_KEY = ["admin", "reporting-obligations"] as const;

export function useObligationAudiences() {
  return useQuery({
    queryKey: ["dd_obligation_audience"],
    queryFn: async (): Promise<DdLookupRow[]> => {
      const { data, error } = await supabase
        .from("dd_obligation_audience")
        .select("id, value, label, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as DdLookupRow[];
    },
  });
}

export function useObligationRecurrences() {
  return useQuery({
    queryKey: ["dd_obligation_recurrence"],
    queryFn: async (): Promise<DdLookupRow[]> => {
      const { data, error } = await supabase
        .from("dd_obligation_recurrence")
        .select("id, value, label, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as DdLookupRow[];
    },
  });
}

export function useReportingObligations() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<ReportingObligationRow[]> => {
      const [obligationsRes, audiencesRes, recurrencesRes] = await Promise.all([
        supabase
          .from("compliance_obligations")
          .select(
            "id, code, title, description, audience_id, recurrence_id, annual_month, annual_day, window_opens_month, window_opens_day, due_date, cta_label, cta_url, sort_order, is_active, notification_message, lead_times"
          )
          .order("sort_order", { ascending: true })
          .order("title", { ascending: true }),
        supabase.from("dd_obligation_audience").select("id, value, label"),
        supabase.from("dd_obligation_recurrence").select("id, value, label"),
      ]);

      if (obligationsRes.error) throw obligationsRes.error;
      if (audiencesRes.error) throw audiencesRes.error;
      if (recurrencesRes.error) throw recurrencesRes.error;

      const audMap = new Map<number, { value: string; label: string }>();
      for (const r of audiencesRes.data || []) audMap.set(r.id, { value: r.value, label: r.label });
      const recMap = new Map<number, { value: string; label: string }>();
      for (const r of recurrencesRes.data || []) recMap.set(r.id, { value: r.value, label: r.label });

      return (obligationsRes.data || []).map((o) => ({
        ...o,
        audience_value: audMap.get(o.audience_id)?.value,
        audience_label: audMap.get(o.audience_id)?.label,
        recurrence_value: recMap.get(o.recurrence_id)?.value,
        recurrence_label: recMap.get(o.recurrence_id)?.label,
      })) as ReportingObligationRow[];
    },
  });
}

export function useUpsertReportingObligation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReportingObligationInput) => {
      const { id, ...payload } = input;
      if (id != null) {
        const { data, error } = await supabase
          .from("compliance_obligations")
          .update(payload satisfies TablesUpdate<"compliance_obligations">)
          .eq("id", id)
          .select("id")
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from("compliance_obligations")
        .insert(payload satisfies TablesInsert<"compliance_obligations">)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useToggleObligationActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      const { error } = await supabase
        .from("compliance_obligations")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useDeleteReportingObligation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("compliance_obligations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
