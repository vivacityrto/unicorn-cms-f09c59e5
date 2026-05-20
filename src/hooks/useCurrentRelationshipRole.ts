import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { RelationshipRole } from "@/lib/roles/relationshipRole";

export function useCurrentRelationshipRole() {
  const { profile } = useAuth();
  const userUuid = profile?.user_uuid;
  const tenantId = profile?.tenant_id;

  const { data, isLoading } = useQuery({
    queryKey: ["current-relationship-role", userUuid, tenantId],
    enabled: !!userUuid && !!tenantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_users")
        .select("relationship_role")
        .eq("user_id", userUuid!)
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return (data?.relationship_role ?? null) as RelationshipRole | null;
    },
  });

  return { relationshipRole: data ?? null, isLoading };
}
