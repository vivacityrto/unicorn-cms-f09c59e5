/**
 * useStrategicOrchestration – Phase 20
 *
 * Hook for strategic priorities, decision log, and orchestration overview.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

export interface StrategicPriority {
  id: string;
  priority_type: string;
  severity_level: string;
  impact_scope: string;
  affected_entities_json: any[];
  recommended_actions_json: any[];
  priority_summary: string;
  resolved_flag: boolean;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
  created_at: string;
}

export interface StrategicDecision {
  id: string;
  priority_id: string;
  decision_summary: string;
  action_taken: string;
  outcome_review_date: string | null;
  recorded_by_user_id: string;
  created_at: string;
}

export function useStrategicPriorities() {
  return useQuery({
    queryKey: ["strategic-priorities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("strategic_priorities")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as StrategicPriority[];
    },
  });
}

export function useStrategicPriorityOverview() {
  const { data: priorities } = useStrategicPriorities();

  const active = priorities?.filter(p => !p.resolved_flag) || [];
  const last30d = priorities?.filter(p => {
    const created = new Date(p.created_at).getTime();
    return created >= Date.now() - 30 * 86400000;
  }) || [];

  return {
    totalActive: active.length,
    criticalActive: active.filter(p => p.severity_level === "critical").length,
    highActive: active.filter(p => p.severity_level === "high").length,
    last30dCreated: last30d.length,
    last30dResolved: last30d.filter(p => p.resolved_flag).length,
    byType: {
      compliance_cluster: active.filter(p => p.priority_type === "compliance_cluster").length,
      capacity_crisis: active.filter(p => p.priority_type === "capacity_crisis").length,
      regulator_exposure: active.filter(p => p.priority_type === "regulator_exposure").length,
      retention_threat: active.filter(p => p.priority_type === "retention_threat").length,
      systemic_clause_spike: active.filter(p => p.priority_type === "systemic_clause_spike").length,
      operational_breakdown: active.filter(p => p.priority_type === "operational_breakdown").length,
    },
  };
}

export function useResolvePriority() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (priorityId: string) => {
      const { error } = await supabase
        .from("strategic_priorities")
        .update({
          resolved_flag: true,
          resolved_at: new Date().toISOString(),
          resolved_by_user_id: profile?.user_uuid,
        })
        .eq("id", priorityId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["strategic-priorities"] });
      toast({ title: "Priority resolved" });
    },
    onError: () => toast({ title: "Failed to resolve priority", variant: "destructive" }),
  });
}

export function useDecisionLog(priorityId: string | null) {
  return useQuery({
    queryKey: ["strategic-decisions", priorityId],
    enabled: !!priorityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("strategic_decision_log")
        .select("*")
        .eq("priority_id", priorityId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as StrategicDecision[];
    },
  });
}

export function useLogDecision() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: {
      priority_id: string;
      decision_summary: string;
      action_taken: string;
      outcome_review_date?: string;
    }) => {
      const { error } = await supabase.from("strategic_decision_log").insert({
        priority_id: input.priority_id,
        decision_summary: input.decision_summary,
        action_taken: input.action_taken,
        outcome_review_date: input.outcome_review_date || null,
        recorded_by_user_id: profile?.user_uuid || "",
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["strategic-decisions", vars.priority_id] });
      toast({ title: "Decision recorded" });
    },
    onError: () => toast({ title: "Failed to record decision", variant: "destructive" }),
  });
}

export function useRunOrchestration() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("strategic-orchestration", {
        method: "POST",
        body: {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["strategic-priorities"] });
      toast({ title: "Orchestration complete", description: `${data?.priorities_created || 0} priorities created` });
    },
    onError: () => toast({ title: "Orchestration failed", variant: "destructive" }),
  });
}
