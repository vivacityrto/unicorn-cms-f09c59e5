import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_STALE_TIMES } from "@/lib/queryConfig";
import type { Tables } from "@/integrations/supabase/types";

export interface TriageStaffOption {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  unicorn_role: string | null;
  display_name: string;
}

const TRIAGE_ROLES = ["Super Admin", "Team Member", "CSC", "Integrator", "BGT"];

export function useTriageStaffOptions() {
  return useQuery({
    queryKey: ["triage-staff"],
    queryFn: async (): Promise<TriageStaffOption[]> => {
      const { data, error } = await supabase
        .from("users")
        .select("user_uuid, first_name, last_name, email, avatar_url, unicorn_role")
        .in("unicorn_role", TRIAGE_ROLES)
        .eq("disabled", false)
        .eq("archived", false)
        .or("kpi_pod.is.null,kpi_pod.neq.qa")
        .order("first_name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((u: Pick<Tables<"users">, "user_uuid" | "first_name" | "last_name" | "email" | "avatar_url" | "unicorn_role">) => ({
        ...u,
        display_name:
          [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
          u.email ||
          "Unnamed",
      }));
    },
    staleTime: QUERY_STALE_TIMES.PROFILE,
  });
}
