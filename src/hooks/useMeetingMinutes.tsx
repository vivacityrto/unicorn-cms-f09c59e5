import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { EosMeetingMinutesVersion, EosMinutesAuditLog, MinutesSnapshot } from '@/types/eos';
import type { Json } from '@/integrations/supabase/types';

export function useMeetingMinutes(meetingId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Fetch all versions for a meeting
  const { data: versions = [], isLoading: versionsLoading } = useQuery({
    queryKey: ['meeting-minutes-versions', meetingId],
    queryFn: async () => {
      if (!meetingId) return [];
      
      const { data, error } = await supabase
        .from('eos_meeting_minutes_versions')
        .select('*')
        .eq('meeting_id', meetingId)
        .order('version_number', { ascending: false });

      if (error) throw error;
      return (data || []).map(v => ({
        ...v,
        minutes_snapshot: v.minutes_snapshot as unknown as MinutesSnapshot
      })) as EosMeetingMinutesVersion[];
    },
    enabled: !!meetingId,
  });

  // Fetch audit log for a meeting
  const { data: auditLog = [], isLoading: auditLoading } = useQuery({
    queryKey: ['meeting-minutes-audit', meetingId],
    queryFn: async () => {
      if (!meetingId || !profile?.tenant_id) return [];
      
      const { data, error } = await supabase
        .from('eos_minutes_audit_log')
        .select('*')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as EosMinutesAuditLog[];
    },
    enabled: !!meetingId && !!profile?.tenant_id,
  });

  // Get current version
  const currentVersion = versions.length > 0 ? versions[0] : null;

  // Save minutes
  const saveMinutes = useMutation({
    mutationFn: async ({ snapshot, changeSummary }: { snapshot: MinutesSnapshot; changeSummary?: string }) => {
      if (!meetingId) throw new Error('No meeting ID');
      
      const { data, error } = await supabase.rpc('save_meeting_minutes', {
        p_meeting_id: meetingId,
        p_minutes_snapshot: snapshot as unknown as Json,
        p_change_summary: changeSummary || null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-minutes-versions', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['meeting-minutes-audit', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['eos-meetings'] });
      toast.success('Minutes saved');
    },
    onError: (error: Error) => {
      toast.error(`Failed to save minutes: ${error.message}`);
    },
  });

  // Finalise minutes
  const finaliseMinutes = useMutation({
    mutationFn: async (summary: string) => {
      if (!meetingId) throw new Error('No meeting ID');
      
      const { data, error } = await supabase.rpc('finalise_meeting_minutes', {
        p_meeting_id: meetingId,
        p_summary: summary,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-minutes-versions', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['meeting-minutes-audit', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['eos-meetings'] });
      toast.success('Minutes finalised');
    },
    onError: (error: Error) => {
      toast.error(`Failed to finalise minutes: ${error.message}`);
    },
  });

  // Create revision
  const createRevision = useMutation({
    mutationFn: async (reason: string) => {
      if (!meetingId) throw new Error('No meeting ID');
      
      const { data, error } = await supabase.rpc('create_minutes_revision', {
        p_meeting_id: meetingId,
        p_reason: reason,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-minutes-versions', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['meeting-minutes-audit', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['eos-meetings'] });
      toast.success('Revision created - you can now edit the minutes');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create revision: ${error.message}`);
    },
  });

  // Lock minutes (SuperAdmin only)
  const lockMinutes = useMutation({
    mutationFn: async (reason?: string) => {
      if (!meetingId) throw new Error('No meeting ID');
      
      const { error } = await supabase.rpc('lock_meeting_minutes', {
        p_meeting_id: meetingId,
        p_reason: reason || 'Minutes locked',
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-minutes-versions', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['meeting-minutes-audit', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['eos-meetings'] });
      toast.success('Minutes locked');
    },
    onError: (error: Error) => {
      toast.error(`Failed to lock minutes: ${error.message}`);
    },
  });

  // Unlock minutes (SuperAdmin only)
  const unlockMinutes = useMutation({
    mutationFn: async (reason: string) => {
      if (!meetingId) throw new Error('No meeting ID');
      
      const { error } = await supabase.rpc('unlock_meeting_minutes', {
        p_meeting_id: meetingId,
        p_reason: reason,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-minutes-versions', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['meeting-minutes-audit', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['eos-meetings'] });
      toast.success('Minutes unlocked');
    },
    onError: (error: Error) => {
      toast.error(`Failed to unlock minutes: ${error.message}`);
    },
  });

  // Restore version
  const restoreVersion = useMutation({
    mutationFn: async ({ versionId, reason }: { versionId: string; reason: string }) => {
      const { data, error } = await supabase.rpc('restore_minutes_version', {
        p_version_id: versionId,
        p_reason: reason,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting-minutes-versions', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['meeting-minutes-audit', meetingId] });
      queryClient.invalidateQueries({ queryKey: ['eos-meetings'] });
      toast.success('Version restored');
    },
    onError: (error: Error) => {
      toast.error(`Failed to restore version: ${error.message}`);
    },
  });

  return {
    versions,
    currentVersion,
    auditLog,
    isLoading: versionsLoading || auditLoading,
    saveMinutes,
    finaliseMinutes,
    createRevision,
    lockMinutes,
    unlockMinutes,
    restoreVersion,
  };
}
