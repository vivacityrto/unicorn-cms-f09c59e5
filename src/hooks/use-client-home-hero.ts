import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClientTenant } from "@/contexts/ClientTenantContext";

export interface ClientHomeHero {
  tenant_id: number;
  tenant_name: string;
  tenant_legal_name: string | null;
  member_since: string | null;
  total_packages_ever: number | null;
  active_packages: number;
  historical_packages: number;
  csc_user_id: string | null;
  csc_display_name: string | null;
  csc_first_name: string | null;
  csc_email: string | null;
  csc_avatar_url: string | null;
  csc_role_label: string;
  audits_total: number;
}

export function useClientHomeHero() {
  const { activeTenantId } = useClientTenant();
  return useQuery({
    queryKey: ["client_home_hero", activeTenantId],
    enabled: !!activeTenantId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ClientHomeHero | null> => {
      const { data, error } = await supabase
        .from("v_client_home_hero")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ClientHomeHero | null;
    },
  });
}
