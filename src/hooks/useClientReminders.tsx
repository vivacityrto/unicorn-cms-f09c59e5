import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRBAC } from "@/hooks/useRBAC";
import { useClientPreview } from "@/contexts/ClientPreviewContext";

export interface ClientReminder {
  item_type: string;
  item_id: string;
  tenant_id: number;
  title: string;
  starts_at: string;
  ends_at: string | null;
  owner_user_id: string;
  meta: Record<string, any>;
}

/**
 * Hook to fetch client reminders from the appropriate view based on role.
 * - ClientUser (General User / User): my_client_reminders (own items only)
 * - ClientAdmin (Admin) or preview mode: tenant_client_reminders (all tenant items)
 */
export function useClientReminders() {
  const { profile } = useAuth();
  const { isVivacityTeam } = useRBAC();
  const { isPreviewMode } = useClientPreview();

  const userRole = profile?.unicorn_role || "User";
  const isClientAdmin = userRole === "Admin";

  // Use tenant-wide view for Admin role, Vivacity preview, or preview mode
  const useTenantWide = isClientAdmin || isVivacityTeam || isPreviewMode;
  const viewName = useTenantWide ? "tenant_client_reminders" : "my_client_reminders";

  const query = useQuery({
    queryKey: ["client-reminders", viewName, profile?.user_uuid],
    queryFn: async (): Promise<ClientReminder[]> => {
      const { data, error } = await supabase
        .from(viewName)
        .select("*")
        .order("starts_at", { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as ClientReminder[];
    },
    enabled: !!profile?.user_uuid,
  });

  return {
    ...query,
    reminders: query.data || [],
    isClientAdmin: useTenantWide,
  };
}
