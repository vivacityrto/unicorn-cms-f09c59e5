import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface MeetingMinutesDraft {
  id: string;
  tenant_id: number;
  meeting_id: string;
  title: string;
  content: string;
  status: 'draft' | 'published';
  published_at: string | null;
  published_by: string | null;
  portal_document_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function useMeetingMinutesDraft(meetingId: string | null) {
  const queryClient = useQueryClient();

  const { data: draft, isLoading } = useQuery({
    queryKey: ['meeting-minutes-draft', meetingId],
    queryFn: async () => {
      if (!meetingId) return null;
      const { data, error } = await supabase
        .from('meeting_minutes_drafts')
        .select('*')
        .eq('meeting_id', meetingId)
        .maybeSingle();

      if (error) throw error;
      return data as MeetingMinutesDraft | null;
    },
    enabled: !!meetingId,
  });

  const updateDraftMutation = useMutation({
    mutationFn: async ({ draftId, content, title }: { draftId: string; content: string; title?: string }) => {
      const updates: Record<string, unknown> = {
        content,
        updated_at: new Date().toISOString(),
      };
      if (title) updates.title = title;

      const { error } = await supabase
        .from('meeting_minutes_drafts')
        .update(updates)
        .eq('id', draftId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Minutes draft saved');
      queryClient.invalidateQueries({ queryKey: ['meeting-minutes-draft', meetingId] });
    },
    onError: () => {
      toast.error('Failed to save minutes draft');
    },
  });

  const publishMinutesMutation = useMutation({
    mutationFn: async (draftId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('publish-meeting-minutes', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { draft_id: draftId },
      });

      if (error) throw new Error(error.message);
      if (data && 'error' in data) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success('Minutes published to client portal');
      queryClient.invalidateQueries({ queryKey: ['meeting-minutes-draft', meetingId] });
    },
    onError: (error) => {
      console.error('Publish minutes failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to publish minutes');
    },
  });

  return {
    draft,
    isLoading,
    updateDraft: updateDraftMutation.mutate,
    isUpdating: updateDraftMutation.isPending,
    publishMinutes: publishMinutesMutation.mutate,
    isPublishing: publishMinutesMutation.isPending,
  };
}
