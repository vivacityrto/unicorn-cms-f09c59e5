import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { isOpenIssue, issueSourceFor } from '@/utils/rockDiscussion';
import { isRockMilestoneSchemaUnavailable } from '@/utils/rockMilestones';
import type { EosRockMilestone } from '@/types/eos';

export interface LinkedIssue {
  id: string;
  title: string;
  status: string | null;
  created_at: string | null;
  meeting_id: string | null;
}

/**
 * Issues already raised for a Rock, newest first. Shown on its slide so the room can see
 * what is already waiting for IDS, and so the same problem is not raised twice.
 */
export function useRockLinkedIssues(rockId: string | undefined) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['rock-linked-issues', rockId],
    queryFn: async (): Promise<LinkedIssue[]> => {
      const { data, error } = await supabase
        .from('eos_issues')
        .select('id, title, status, created_at, meeting_id')
        .eq('linked_rock_id', rockId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile && !!rockId,
  });
}

/** Rock ids that have at least one open issue, for the wrap-up. One query for the whole deck. */
export function useOpenIssueRockIds(rockIds: readonly string[], enabled: boolean) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['rock-open-issue-rock-ids', rockIds],
    queryFn: async (): Promise<string[]> => {
      if (rockIds.length === 0) return [];
      const { data, error } = await supabase
        .from('eos_issues')
        .select('linked_rock_id, status')
        .in('linked_rock_id', [...rockIds])
        .is('deleted_at', null);
      if (error) throw error;
      return Array.from(new Set((data ?? []).filter(i => isOpenIssue(i.status) && i.linked_rock_id).map(i => i.linked_rock_id as string)));
    },
    enabled: !!profile && enabled && rockIds.length > 0,
  });
}

/**
 * A Rock's milestones. Same query key and shape as the Rock details panel, so the two share
 * one cache entry and a change in either shows in both.
 */
export function useRockMilestones(rockId: string | undefined, enabled = true) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['eos-rock-milestones', rockId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_rock_milestones')
        .select('*')
        .eq('rock_id', rockId!)
        .order('sort_order', { ascending: true });
      if (error) {
        if (isRockMilestoneSchemaUnavailable(error)) return [] as EosRockMilestone[];
        throw error;
      }
      return data as EosRockMilestone[];
    },
    enabled: !!profile && enabled && !!rockId,
  });
}

export interface RaiseRockIssueInput {
  title: string;
  description: string;
  rockId: string;
  meetingId?: string;
  meetingSegmentId?: string;
  meetingType?: string | null;
}

/**
 * Raise an issue for a Rock into the meeting's IDS queue. It writes the same columns the
 * IDS dialog writes (so it lands in the same queue, with the same source), plus the link
 * to the Rock.
 */
export function useRaiseRockIssue() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RaiseRockIssueInput) => {
      const { data, error } = await supabase
        .from('eos_issues')
        .insert({
          tenant_id: profile?.tenant_id ?? null,
          item_type: 'risk',
          title: input.title.trim(),
          description: input.description,
          linked_rock_id: input.rockId,
          meeting_id: input.meetingId,
          meeting_segment_id: input.meetingSegmentId,
          source: issueSourceFor(input.meetingType),
          created_by: profile?.user_uuid,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      for (const queryKey of [['meeting-issues'], ['risks-opportunities'], ['eos-issues'], ['rock-linked-issues'], ['rock-open-issue-rock-ids']]) {
        queryClient.invalidateQueries({ queryKey });
      }
      // No success toast: the panel confirms inline, and a toast would take the first Escape press
      // (the newest layer is dismissed first) so the view would not close on it.
    },
    onError: error => {
      const description = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : 'Nothing was added.';
      toast({ title: 'Could not raise the issue', description, variant: 'destructive' });
    },
  });
}

/**
 * Change a Rock's status from the Discuss view. Blocked is not available here (it needs a
 * recorded reason, so it goes through the blocker dialog) and neither is Complete.
 */
export function useSetRockStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: 'on_track' | 'at_risk' | 'off_track' }) => {
      const { error } = await supabase.from('eos_rocks').update({ status: input.status, completed_date: null }).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      for (const queryKey of [['eos-rocks'], ['eos-rocks-hierarchy'], ['eos-rock-history'], ['eos-rock-contribution']]) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: error => {
      const description = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : 'The status was not changed.';
      toast({ title: 'Could not change the status', description, variant: 'destructive' });
    },
  });
}
