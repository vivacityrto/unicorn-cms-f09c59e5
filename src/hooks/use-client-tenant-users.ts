import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClientTenant } from "@/contexts/ClientTenantContext";

export type TenantUserRowType = "active" | "invited";
export type TenantUserStatus = "active" | "disabled" | "archived" | "invited";
export type TenantUserRelationshipRole =
  | "primary_contact"
  | "secondary_contact"
  | "user"
  | "academy_user"
  | null;

export interface ClientTenantUserRow {
  row_type: TenantUserRowType;
  row_key: string;
  tenant_id: number;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  relationship_role: TenantUserRelationshipRole;
  primary_contact: boolean | null;
  secondary_contact: boolean | null;
  access_scope: string | null;
  last_sign_in_at: string | null;
  last_active_at: string | null;
  invited_at: string | null;
  invite_expires_at: string | null;
  status: TenantUserStatus;
  member_since: string | null;
  last_sent_at: string | null;
  mailgun_message_id: string | null;
  delivery_status?: 'delivered' | 'bounced' | 'failed' | 'complained' | null;
  delivery_event_at?: string | null;
  open_count?: number | null;
  first_opened_at?: string | null;
  click_count?: number | null;
  first_clicked_at?: string | null;
}

export function useClientTenantUsers() {
  const { activeTenantId } = useClientTenant();
  return useQuery({
    queryKey: ["client_tenant_users", activeTenantId],
    enabled: !!activeTenantId,
    staleTime: 30_000,
    queryFn: async (): Promise<ClientTenantUserRow[]> => {
      const { data, error } = await supabase
        .from("v_client_tenant_users")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .order("row_type", { ascending: true })
        .order("primary_contact", { ascending: false, nullsFirst: false })
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClientTenantUserRow[];
    },
  });
}
