import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UserSetupLink {
  id: number;
  code: string;
  label: string;
  url: string;
  category: "m365" | "other" | string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
}

export function useUserSetupLinks() {
  return useQuery({
    queryKey: ["dd_usersetup_links"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dd_usersetup_links" as any)
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { nullsFirst: false })
        .order("id");
      if (error) throw error;
      return (data ?? []) as unknown as UserSetupLink[];
    },
    staleTime: 30 * 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}
