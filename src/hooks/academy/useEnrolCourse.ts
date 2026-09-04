import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAcademyActingUserId } from "@/hooks/academy/useAcademyActingUserId";
import { useClientPreview } from "@/contexts/ClientPreviewContext";
import {
  useReadOnlyGuard,
  PREVIEW_BLOCKED_ERROR,
  isPreviewBlockedError,
} from "@/hooks/useReadOnlyGuard";
import { friendlyDbError } from "@/lib/friendlyDbError";

const TENANT_CONTEXT_REQUIRED = "tenant_context_required";

/**
 * Enrol the acting user in a course. When the staff member is impersonating,
 * routes through `enrol_as_impersonator` so the row carries
 * source='staff_impersonation' and enrolled_by=actor. The staff member's
 * active preview tenant id is required and validated server-side.
 */
export function useEnrolCourse() {
  const qc = useQueryClient();
  const { userId, isImpersonating } = useAcademyActingUserId();
  const { previewTenant } = useClientPreview();
  const { blockWrite } = useReadOnlyGuard();
  const canMutate = userId !== null;

  const mutation = useMutation({
    mutationFn: async (courseId: number) => {
      if (blockWrite("Enrol")) throw new Error(PREVIEW_BLOCKED_ERROR);
      if (!userId) throw new Error("No acting user resolved");

      if (isImpersonating) {
        if (!previewTenant?.id) {
          throw new Error(TENANT_CONTEXT_REQUIRED);
        }
        const { data, error } = await supabase.rpc("enrol_as_impersonator", {
          p_course_id: courseId,
          p_target_user_id: userId,
          p_tenant_id: previewTenant.id,
        });
        if (error) throw error;
        return data;
      }

      const { data, error } = await supabase.rpc("enrol_in_academy_course", {
        p_course_id: courseId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(isImpersonating ? "Enrolled (as impersonated user)" : "You're enrolled");
      qc.invalidateQueries({ queryKey: ["academy-my-enrolled-courses"] });
      qc.invalidateQueries({ queryKey: ["academy-my-courses"] });
      qc.invalidateQueries({ queryKey: ["academy-dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["academy-courses"] });
      qc.invalidateQueries({ queryKey: ["academy-enrollment-detail"] });
      qc.invalidateQueries({ queryKey: ["academy-enrollment-raw"] });
    },
    onError: (e: Error) => {
      if (isPreviewBlockedError(e)) return;
      const msg = (e?.message ?? "") + " " + JSON.stringify(e ?? {});
      if (msg.includes("tenant_context_required")) {
        toast.error("No active tenant context — exit and re-enter the client view");
        return;
      }
      if (msg.includes("target_user_not_in_tenant")) {
        toast.error("This user does not belong to the current tenant");
        return;
      }
      if (msg.includes("existing_enrolment_different_tenant")) {
        toast.error("This user is already enrolled under a different tenant context");
        return;
      }
      const code = (e as Error & { code?: string })?.code;
      if (
        msg.includes("invalid_target_user") ||
        msg.includes("violates foreign key constraint") ||
        code === "23503"
      ) {
        toast.error("This user's account is no longer active — please exit the preview and select a different user.");
        return;
      }
      toast.error(friendlyDbError(e, "useEnrolCourse"));
    },
  });

  return { ...mutation, canMutate };
}
