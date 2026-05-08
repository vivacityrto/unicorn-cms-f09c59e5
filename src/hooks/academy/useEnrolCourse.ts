import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAcademyActingUserId } from "@/hooks/academy/useAcademyActingUserId";

/**
 * Enrol the acting user in a course. When the staff member is impersonating,
 * routes through `enrol_as_impersonator` so the row carries
 * source='staff_impersonation' and enrolled_by=actor.
 */
export function useEnrolCourse() {
  const qc = useQueryClient();
  const { userId, isImpersonating } = useAcademyActingUserId();
  const canMutate = userId !== null;

  const mutation = useMutation({
    mutationFn: async (courseId: number) => {
      if (!userId) throw new Error("No acting user resolved");
      if (isImpersonating) {
        const { data, error } = await supabase.rpc("enrol_as_impersonator", {
          p_course_id: courseId,
          p_target_user_id: userId,
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
    onError: (e: Error) => toast.error(e.message || "Failed to enrol"),
  });

  return { ...mutation, canMutate };
}
