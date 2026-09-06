import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

type ChecklistInstance = Pick<
  Database["public"]["Tables"]["lifecycle_checklist_instances"]["Row"],
  "completed"
>;
type SetupPrompt = Pick<
  Database["public"]["Tables"]["user_profile_setup_prompts"]["Row"],
  "dismissed_until"
>;

export interface StaffOnboardingStatus {
  runId: number | null;
  firstName: string | null;
  completedCount: number;
  totalCount: number;
  isComplete: boolean;
  firstLoginDetectedAt: string | null;
  welcomeSentAt: string | null;
  dismissedUntil: string | null;
  shouldShowBanner: boolean;
  shouldShowWelcomeModal: boolean;
}

const KEY = ["staff-onboarding-status"];

export function useStaffOnboardingStatus() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const userUuid = user?.id ?? null;
  const isInternal = !!profile?.is_vivacity_internal;

  // Fire idempotent first-login handler once per session when this hook mounts
  useEffect(() => {
    if (!userUuid || !isInternal) return;
    const key = `staff_first_login_called_${userUuid}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    (async () => {
      try {
        await supabase.rpc("handle_staff_first_login", { p_user_uuid: userUuid });
        qc.invalidateQueries({ queryKey: KEY });
      } catch {
        /* non-fatal */
      }
    })();
  }, [userUuid, isInternal, qc]);

  const query = useQuery({
    queryKey: [...KEY, userUuid],
    enabled: !!userUuid && isInternal,
    queryFn: async (): Promise<StaffOnboardingStatus> => {
      const empty: StaffOnboardingStatus = {
        runId: null,
        firstName: null,
        completedCount: 0,
        totalCount: 9,
        isComplete: false,
        firstLoginDetectedAt: null,
        welcomeSentAt: null,
        dismissedUntil: null,
        shouldShowBanner: false,
        shouldShowWelcomeModal: false,
      };
      if (!userUuid) return empty;

      const { data: run } = await supabase
        .from("staff_provisioning_runs")
        .select(
          "id, first_name, first_login_detected_at, onboarding_complete_at, welcome_email_sent_at, status"
        )
        .eq("target_user_id", userUuid)
        .eq("status", "provisioned")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!run) return empty;

      const { data: instances } = await supabase
        .from("lifecycle_checklist_instances")
        .select("id, completed")
        .eq("provisioning_run_id", run.id)
        .eq("lifecycle_type", "staff_onboarding");

      const total = instances?.length ?? 0;
      const done = ((instances as ChecklistInstance[] | null) ?? []).filter((i) => i.completed).length;
      const isComplete = total > 0 && done === total;

      const { data: prompt } = await supabase
        .from("user_profile_setup_prompts")
        .select("dismissed_until")
        .eq("user_uuid", userUuid)
        .maybeSingle();

      const dismissedUntil = (prompt as SetupPrompt | null)?.dismissed_until ?? null;
      const dismissedActive =
        dismissedUntil && new Date(dismissedUntil).getTime() > Date.now();

      const shouldShowBanner = !isComplete && !dismissedActive;
      // Welcome modal: first login just detected, not yet dismissed, nothing complete yet
      const shouldShowWelcomeModal =
        shouldShowBanner && done === 0 && !!run.first_login_detected_at;

      return {
        runId: run.id,
        firstName: run.first_name ?? null,
        completedCount: done,
        totalCount: total || 9,
        isComplete,
        firstLoginDetectedAt: run.first_login_detected_at ?? null,
        welcomeSentAt: run.welcome_email_sent_at ?? null,
        dismissedUntil,
        shouldShowBanner,
        shouldShowWelcomeModal,
      };
    },
  });

  const dismissForToday = useMutation({
    mutationFn: async () => {
      if (!userUuid) return;
      const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await supabase
        .from("user_profile_setup_prompts")
        .upsert(
          { user_uuid: userUuid, dismissed_until: until, last_shown_at: new Date().toISOString() },
          { onConflict: "user_uuid" }
        );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  const clearDismissal = useMutation({
    mutationFn: async () => {
      if (!userUuid) return;
      await supabase
        .from("user_profile_setup_prompts")
        .upsert(
          { user_uuid: userUuid, dismissed_until: null, last_shown_at: new Date().toISOString() },
          { onConflict: "user_uuid" }
        );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  return {
    status: query.data ?? null,
    isLoading: query.isLoading,
    dismissForToday,
    clearDismissal,
  };
}
