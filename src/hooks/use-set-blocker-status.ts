import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type UntypedRpc = (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

export type BlockerAction = 'acknowledge' | 'resolve' | 'reopen';

/**
 * Staff mark a client's blocker seen, resolved or reopened, with an optional short note. The note is written for the
 * client and shown to them. The function refuses anyone who is not Vivacity staff or a super admin.
 */
export function useSetBlockerStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; action: BlockerAction; note?: string }) => {
      const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
      const { data, error } = await rpc('set_package_blocker_status', {
        p_checkin_id: input.id,
        p_action: input.action,
        p_note: input.note?.trim() ? input.note.trim() : null,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenant-checkins-overview'] });
      void qc.invalidateQueries({ queryKey: ['checkins-attention'] });
    },
  });
}
