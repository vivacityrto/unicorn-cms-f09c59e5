import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useClientTenant } from '@/contexts/ClientTenantContext';
import { useAuth } from '@/hooks/useAuth';
import type { BlockerCategory, CheckinKind, CheckinState } from '@/components/client/package-dashboard/checkins';

type UntypedRpc = (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = () => supabase.rpc.bind(supabase) as unknown as UntypedRpc;

/**
 * This person's own check-in state for one package: what is due and how they have answered. The function returns
 * `eligible: false` for anyone who is not a full-access client user of the package's organisation (staff previewing
 * included), and the card then shows nothing. Not in the generated types yet, hence the cast.
 */
export function usePackageCheckinState(packageInstanceId: number | null) {
  const { activeTenantId } = useClientTenant();
  const { profile } = useAuth();
  const userId = profile?.user_uuid ?? null;
  return useQuery({
    queryKey: ['package-checkin-state', userId, activeTenantId, packageInstanceId],
    enabled: !!activeTenantId && !!packageInstanceId && !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<CheckinState> => {
      const { data, error } = await rpc()('get_package_checkin_state', { p_tenant_id: activeTenantId, p_package_instance_id: packageInstanceId });
      if (error) throw new Error(error.message);
      return (data ?? { eligible: false }) as CheckinState;
    },
  });
}

export interface CheckinInput {
  kind: CheckinKind;
  score?: number;
  category?: BlockerCategory;
  comment?: string;
}

/** Saves one answer. The database takes the organisation from the package and the person from the sign-in. */
export function useSubmitCheckin(packageInstanceId: number | null) {
  const qc = useQueryClient();
  const { activeTenantId } = useClientTenant();
  return useMutation({
    mutationFn: async (input: CheckinInput) => {
      const { data, error } = await rpc()('submit_package_checkin', {
        p_tenant_id: activeTenantId,
        p_package_instance_id: packageInstanceId,
        p_kind: input.kind,
        p_score: input.score ?? null,
        p_category: input.category ?? null,
        p_comment: input.comment?.trim() ? input.comment.trim() : null,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['package-checkin-state'] }),
  });
}
