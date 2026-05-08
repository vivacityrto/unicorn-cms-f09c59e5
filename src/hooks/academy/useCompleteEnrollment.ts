import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAcademyActingUserId } from "@/hooks/academy/useAcademyActingUserId";

/**
 * Complete an enrollment. When impersonating, routes through
 * `complete_enrollment_as_impersonator`.
 */
export function useCompleteEnrollment() {
  const qc = useQueryClient();
  const { userId, isImpersonating } = useAcademyActingUserId();
  const canMutate = userId !== null;

  const mutation = useMutation({
    mutationFn: async (enrollmentId: number) => {
      if (!userId) throw new Error("No acting user resolved");
      if (isImpersonating) {
        const { data, error } = await supabase.rpc(
          "complete_enrollment_as_impersonator",
          {
            p_enrollment_id: enrollmentId,
            p_target_user_id: userId,
          }
        );
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.rpc("complete_academy_enrollment", {
        p_enrollment_id: enrollmentId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Enrollment completed");
      qc.invalidateQueries({ queryKey: ["academy-enrollment-detail"] });
      qc.invalidateQueries({ queryKey: ["academy-lesson-progress"] });
      qc.invalidateQueries({ queryKey: ["academy-my-enrolled-courses"] });
      qc.invalidateQueries({ queryKey: ["academy-my-certificates"] });
    },
    onError: (e: Error) => toast.error(e.message || "Failed to complete enrollment"),
  });

  return { ...mutation, canMutate };
}
