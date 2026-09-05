import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { TablesUpdate } from "@/integrations/supabase/types";

export interface OnboardingHubRun {
  id: number;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  job_title: string | null;
  start_date: string | null;
  location_code: string | null;
  role_code: string | null;
  target_user_id: string | null;
  requested_by: string | null;
  status: string | null;
  induction_video_sent_at: string | null;
  induction_video_sent_by: string | null;
  induction_video_watched_at: string | null;
  onboarding_workbook_sent_at: string | null;
  onboarding_workbook_sent_by: string | null;
  onboarding_workbook_returned_at: string | null;
  welcome_email_sent_at: string | null;
  welcome_email_sent_by: string | null;
  welcome_email_notes: string | null;
  workbook_file_path: string | null;
}

export interface OnboardingChecklistInstance {
  id: string;
  template_id: string;
  category: string;
  step_title: string;
  sort_order: number;
  completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
  notes: string | null;
  assigned_to: string | null;
}

export interface OnboardingHubSettings {
  staff_induction_video_url: string | null;
  staff_onboarding_workbook_url: string | null;
}

const RUN_COLS =
  "id, first_name, last_name, display_name, job_title, start_date, location_code, role_code, target_user_id, requested_by, status, induction_video_sent_at, induction_video_sent_by, induction_video_watched_at, onboarding_workbook_sent_at, onboarding_workbook_sent_by, onboarding_workbook_returned_at, welcome_email_sent_at, welcome_email_sent_by, welcome_email_notes, workbook_file_path";

export function useOnboardingHub(runId: number | null) {
  const qc = useQueryClient();

  const runQuery = useQuery({
    queryKey: ["onboarding-hub", "run", runId],
    enabled: !!runId,
    queryFn: async (): Promise<OnboardingHubRun | null> => {
      const { data, error } = await supabase
        .from("staff_provisioning_runs")
        .select(RUN_COLS)
        .eq("id", runId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as OnboardingHubRun | null;
    },
  });

  const instancesQuery = useQuery({
    queryKey: ["onboarding-hub", "instances", runId],
    enabled: !!runId,
    queryFn: async (): Promise<OnboardingChecklistInstance[]> => {
      const { data, error } = await supabase
        .from("lifecycle_checklist_instances")
        .select(
          "id, template_id, completed, completed_by, completed_at, notes, assigned_to, lifecycle_checklist_templates!inner(category, step_title, sort_order, lifecycle_type)"
        )
        .eq("provisioning_run_id", runId!)
        .eq("lifecycle_type", "staff_onboarding");
      if (error) throw error;
      const rows = (data ?? []).map((r) => ({
        id: r.id,
        template_id: r.template_id,
        category: r.lifecycle_checklist_templates?.category ?? "",
        step_title: r.lifecycle_checklist_templates?.step_title ?? "",
        sort_order: r.lifecycle_checklist_templates?.sort_order ?? 0,
        completed: !!r.completed,
        completed_by: r.completed_by,
        completed_at: r.completed_at,
        notes: r.notes,
        assigned_to: r.assigned_to,
      }));
      rows.sort((a, b) => a.sort_order - b.sort_order);
      return rows;
    },
  });

  const settingsQuery = useQuery({
    queryKey: ["onboarding-hub", "settings"],
    queryFn: async (): Promise<OnboardingHubSettings> => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("staff_induction_video_url, staff_onboarding_workbook_url")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return {
        staff_induction_video_url: data?.staff_induction_video_url ?? null,
        staff_onboarding_workbook_url: data?.staff_onboarding_workbook_url ?? null,
      };
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["onboarding-hub", "run", runId] });
    qc.invalidateQueries({ queryKey: ["onboarding-hub", "instances", runId] });
  };

  const updateRun = useMutation({
    mutationFn: async (updates: Partial<OnboardingHubRun>) => {
      if (!runId) throw new Error("No run id");
      const { error } = await supabase
        .from("staff_provisioning_runs")
        .update(updates as TablesUpdate<"staff_provisioning_runs">)
        .eq("id", runId);
      if (error) throw error;

      // Mirror to matching checklist instances by sort_order
      const mirrors: { sort_order: number; completed: boolean }[] = [];
      if ("induction_video_sent_at" in updates)
        mirrors.push({ sort_order: 10, completed: !!updates.induction_video_sent_at });
      if ("induction_video_watched_at" in updates)
        mirrors.push({ sort_order: 20, completed: !!updates.induction_video_watched_at });
      if ("onboarding_workbook_sent_at" in updates)
        mirrors.push({ sort_order: 30, completed: !!updates.onboarding_workbook_sent_at });
      if ("onboarding_workbook_returned_at" in updates)
        mirrors.push({ sort_order: 40, completed: !!updates.onboarding_workbook_returned_at });
      if ("welcome_email_sent_at" in updates)
        mirrors.push({ sort_order: 50, completed: !!updates.welcome_email_sent_at });

      if (mirrors.length > 0) {
        const instances = instancesQuery.data ?? [];
        const me = (await supabase.auth.getUser()).data.user?.id ?? null;
        for (const m of mirrors) {
          const target = instances.find((i) => i.sort_order === m.sort_order);
          if (!target) continue;
          await supabase
            .from("lifecycle_checklist_instances")
            .update({
              completed: m.completed,
              completed_at: m.completed ? new Date().toISOString() : null,
              completed_by: m.completed ? me : null,
            })
            .eq("id", target.id);
        }
      }
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (e: Error) => {
      toast({ title: "Failed to update", description: e.message, variant: "destructive" });
    },
  });

  const toggleInstance = useMutation({
    mutationFn: async ({ id, completed, notes }: { id: string; completed: boolean; notes?: string }) => {
      const me = (await supabase.auth.getUser()).data.user?.id ?? null;
      const { error } = await supabase
        .from("lifecycle_checklist_instances")
        .update({
          completed,
          completed_at: completed ? new Date().toISOString() : null,
          completed_by: completed ? me : null,
          ...(notes !== undefined ? { notes } : {}),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => {
      toast({ title: "Failed to update step", description: e.message, variant: "destructive" });
    },
  });

  return {
    run: runQuery.data ?? null,
    instances: instancesQuery.data ?? [],
    settings: settingsQuery.data ?? { staff_induction_video_url: null, staff_onboarding_workbook_url: null },
    isLoading: runQuery.isLoading || instancesQuery.isLoading || settingsQuery.isLoading,
    updateRun,
    toggleInstance,
  };
}
