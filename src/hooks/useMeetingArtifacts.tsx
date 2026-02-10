import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface MeetingArtifact {
  id: string;
  tenant_id: number;
  meeting_id: string;
  artifact_type: 'recording' | 'transcript' | 'shared_file';
  title: string;
  web_url: string | null;
  drive_id: string | null;
  item_id: string | null;
  captured_at: string;
  captured_by: string;
  metadata: Record<string, unknown>;
  visibility: 'internal' | 'client';
  shared_at: string | null;
  shared_by: string | null;
}

export interface SyncResult {
  success: boolean;
  meeting_id: string;
  artifacts_found: number;
  artifacts_created: number;
  errors: string[];
  ms_sync_status: string;
  minutes_draft_created?: boolean;
}

export function useMeetingArtifacts(meetingId: string | null) {
  const queryClient = useQueryClient();

  const { data: artifacts = [], isLoading } = useQuery({
    queryKey: ['meeting-artifacts', meetingId],
    queryFn: async () => {
      if (!meetingId) return [];
      const { data, error } = await supabase
        .from('meeting_artifacts')
        .select('*')
        .eq('meeting_id', meetingId)
        .order('artifact_type', { ascending: true })
        .order('captured_at', { ascending: false });

      if (error) throw error;
      return (data || []) as MeetingArtifact[];
    },
    enabled: !!meetingId,
  });

  const syncMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke<SyncResult>('sync-meeting-artifacts', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { meeting_id: id },
      });

      if (error) throw new Error(error.message);
      if (data && 'error' in data) throw new Error((data as any).error);
      return data as SyncResult;
    },
    onSuccess: (result) => {
      if (result.artifacts_found === 0) {
        toast.info('No artifacts found for this meeting');
      } else {
        toast.success(`Found ${result.artifacts_found} artifact${result.artifacts_found !== 1 ? 's' : ''}`);
      }
      if (result.minutes_draft_created) {
        toast.success('Minutes draft created');
      }
      if (result.errors?.length > 0) {
        toast.warning(`${result.errors.length} error(s) during sync`);
      }
      queryClient.invalidateQueries({ queryKey: ['meeting-artifacts', result.meeting_id] });
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['meeting-minutes-draft', result.meeting_id] });
    },
    onError: (error) => {
      console.error('Artifact sync failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to sync artifacts');
    },
  });

  const shareArtifactMutation = useMutation({
    mutationFn: async ({ artifactId, share }: { artifactId: string; share: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const updateData: Record<string, unknown> = {
        visibility: share ? 'client' : 'internal',
      };
      if (share) {
        updateData.shared_at = new Date().toISOString();
        updateData.shared_by = user.id;
      } else {
        updateData.shared_at = null;
        updateData.shared_by = null;
      }

      const { error } = await supabase
        .from('meeting_artifacts')
        .update(updateData)
        .eq('id', artifactId);

      if (error) throw error;

      // Audit log
      await supabase.from('audit_events').insert({
        entity: 'meeting_artifact',
        entity_id: artifactId,
        action: share ? 'artifact_shared' : 'artifact_unshared',
        user_id: user.id,
        details: { visibility: share ? 'client' : 'internal' },
      });
    },
    onSuccess: () => {
      toast.success('Artifact visibility updated');
      queryClient.invalidateQueries({ queryKey: ['meeting-artifacts', meetingId] });
    },
    onError: (error) => {
      console.error('Share artifact failed:', error);
      toast.error('Failed to update artifact visibility');
    },
  });

  return {
    artifacts,
    isLoading,
    syncArtifacts: syncMutation.mutate,
    isSyncing: syncMutation.isPending,
    lastSyncResult: syncMutation.data ?? null,
    shareArtifact: shareArtifactMutation.mutate,
    isSharingArtifact: shareArtifactMutation.isPending,
  };
}
