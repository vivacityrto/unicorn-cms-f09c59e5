import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TenantContactsData {
  primary_contact_name: string | null;
  member_count: number;
  state: string | null;
}

export type TenantContactsMap = Record<number, TenantContactsData>;

/**
 * Resolves per-tenant: primary contact name, member count, and the
 * (admin-derived) state label.
 */
export function useTenantContacts(tenantIds: number[]) {
  const sortedIds = [...tenantIds].sort((a, b) => a - b);

  return useQuery({
    queryKey: ["tenants", "contacts", sortedIds],
    enabled: sortedIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TenantContactsMap> => {
      // Member counts (all tenant_users rows).
      const { data: members, error: membersErr } = await supabase
        .from("tenant_users")
        .select("tenant_id")
        .in("tenant_id", sortedIds);
      if (membersErr) throw membersErr;
      const memberCount: Record<number, number> = {};
      (members || []).forEach((m: any) => {
        memberCount[m.tenant_id] = (memberCount[m.tenant_id] || 0) + 1;
      });

      // Primary contacts: earliest primary_contact = true per tenant.
      const { data: primary, error: primaryErr } = await supabase
        .from("tenant_users")
        .select("tenant_id, user_id, created_at")
        .in("tenant_id", sortedIds)
        .eq("primary_contact", true)
        .order("created_at", { ascending: true });
      if (primaryErr) throw primaryErr;

      const primaryUserIds = [...new Set((primary || []).map((p: any) => p.user_id).filter(Boolean))];
      const { data: primaryUsers } = primaryUserIds.length > 0
        ? await supabase
            .from("users")
            .select("user_uuid, first_name, last_name")
            .in("user_uuid", primaryUserIds)
        : { data: [] as any[] };
      const primaryUserMap: Record<string, string | null> = {};
      (primaryUsers || []).forEach((u: any) => {
        primaryUserMap[u.user_uuid] = `${u.first_name || ""} ${u.last_name || ""}`.trim() || null;
      });
      const primaryContactMap: Record<number, string | null> = {};
      (primary || []).forEach((pc: any) => {
        if (!primaryContactMap[pc.tenant_id]) {
          primaryContactMap[pc.tenant_id] = primaryUserMap[pc.user_id] || null;
        }
      });

      // State derived from the first Admin user per tenant.
      const { data: adminUsers } = await supabase
        .from("users")
        .select("tenant_id, state")
        .eq("unicorn_role", "Admin")
        .in("tenant_id", sortedIds);
      const stateCodes = [...new Set((adminUsers || []).map((u: any) => u.state).filter(Boolean))];
      const { data: statesData } = stateCodes.length > 0
        ? await supabase.from("dd_states" as any).select("legacy_code, label").in("legacy_code", stateCodes)
        : { data: [] as any[] };
      const stateLabel: Record<number, string> = {};
      (statesData || []).forEach((s: any) => { stateLabel[s.legacy_code] = s.label; });
      const stateMap: Record<number, string | null> = {};
      (adminUsers || []).forEach((u: any) => {
        if (!stateMap[u.tenant_id] && u.state) {
          stateMap[u.tenant_id] = stateLabel[u.state] || null;
        }
      });

      const result: TenantContactsMap = {};
      sortedIds.forEach(id => {
        result[id] = {
          primary_contact_name: primaryContactMap[id] || null,
          member_count: memberCount[id] || 0,
          state: stateMap[id] || null,
        };
      });
      return result;
    },
  });
}
