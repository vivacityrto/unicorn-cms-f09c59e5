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
    // A bit more resilient than the app-wide default: this query is four
    // requests deep (two sequential waves below), so it has more surface
    // area for one leg to hit a transient failure (e.g. an auth token
    // refresh racing an in-flight request) than a typical single-request
    // query, and a failure here silently reads as "no client has a primary
    // contact" rather than an obvious error.
    retry: 3,
    queryFn: async (): Promise<TenantContactsMap> => {
      // First wave: three independent lookups, run concurrently rather than
      // sequentially - besides being faster, it also shrinks the window in
      // which a mid-flight session refresh can catch one request but not
      // the others.
      const [
        { data: members, error: membersErr },
        { data: primary, error: primaryErr },
        { data: adminUsers, error: adminUsersErr },
      ] = await Promise.all([
        // Member counts (all tenant_users rows).
        supabase
          .from("tenant_users")
          .select("tenant_id")
          .in("tenant_id", sortedIds),
        // Primary contacts: earliest relationship_role='primary_contact' per tenant.
        supabase
          .from("tenant_users")
          .select("tenant_id, user_id, created_at")
          .in("tenant_id", sortedIds)
          .eq("relationship_role", "primary_contact")
          .order("created_at", { ascending: true }),
        // State derived from the first Admin user per tenant.
        supabase
          .from("users")
          .select("tenant_id, state")
          .eq("unicorn_role", "Admin")
          .in("tenant_id", sortedIds),
      ]);
      if (membersErr) throw membersErr;
      if (primaryErr) throw primaryErr;
      if (adminUsersErr) throw adminUsersErr;

      const memberCount: Record<number, number> = {};
      (members || []).forEach((m: any) => {
        memberCount[m.tenant_id] = (memberCount[m.tenant_id] || 0) + 1;
      });

      const primaryUserIds = [...new Set((primary || []).map((p: any) => p.user_id).filter(Boolean))];
      const stateCodes = [...new Set((adminUsers || []).map((u: any) => u.state).filter(Boolean))];

      // Second wave: each depends on a first-wave result, but not on each
      // other, so they can also run concurrently.
      const [
        { data: primaryUsers, error: primaryUsersErr },
        { data: statesData, error: statesErr },
      ] = await Promise.all([
        primaryUserIds.length > 0
          ? supabase
              .from("users")
              .select("user_uuid, first_name, last_name")
              .in("user_uuid", primaryUserIds)
          : Promise.resolve({ data: [] as any[], error: null }),
        stateCodes.length > 0
          ? supabase.from("dd_states" as any).select("legacy_code, label").in("legacy_code", stateCodes)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);
      if (primaryUsersErr) throw primaryUsersErr;
      if (statesErr) throw statesErr;

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
