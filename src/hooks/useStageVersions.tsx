import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface StageVersion {
  id: string;
  stage_id: number;
  version_number: number;
  status: 'draft' | 'published' | 'archived';
  notes: string | null;
  snapshot: StageSnapshot;
  created_at: string;
  created_by: string | null;
}

export interface StageSnapshot {
  stage: {
    id: number;
    name: string;
    type: string;
    description: string | null;
    ai_hint: string | null;
    is_certified: boolean;
    certified_notes: string | null;
    package_type: string | null;
  };
  team_tasks: Array<{
    id: number;
    name: string;
    description: string | null;
    owner_role: string | null;
    estimated_hours: number | null;
    is_mandatory: boolean;
    sort_order: number;
  }>;
  client_tasks: Array<{
    id: number;
    name: string;
    instructions: string | null;
    required_documents: string[] | null;
    sort_order: number;
  }>;
  emails: Array<{
    id: number;
    email_template_id: string;
    trigger_type: string;
    recipient_type: string;
    is_active: boolean;
    sort_order: number;
    template_name: string | null;
  }>;
  documents: Array<{
    id: number;
    document_id: number;
    visibility: string;
    delivery_type: string;
    sort_order: number;
    document_name: string | null;
  }>;
}

export interface VersionDiff {
  from_version: string;
  to_version: string;
  stage: { from: StageSnapshot['stage']; to: StageSnapshot['stage'] };
  team_tasks: { from: StageSnapshot['team_tasks']; to: StageSnapshot['team_tasks'] };
  client_tasks: { from: StageSnapshot['client_tasks']; to: StageSnapshot['client_tasks'] };
  emails: { from: StageSnapshot['emails']; to: StageSnapshot['emails'] };
  documents: { from: StageSnapshot['documents']; to: StageSnapshot['documents'] };
}

export interface CertifiedEditCheck {
  can_edit: boolean;
  reason: string;
  active_count?: number;
  suggestion?: string;
}

export function useStageVersions(stageId: number | null) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all versions for a stage
  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['stage-versions', stageId],
    queryFn: async () => {
      if (!stageId) return [];
      const { data, error } = await supabase
        .from('stage_versions')
        .select('*')
        .eq('stage_id', stageId)
        .order('version_number', { ascending: false });
      
      if (error) throw error;
      return (data as unknown as StageVersion[]) || [];
    },
    enabled: !!stageId,
  });

  // Get latest published version
  const latestPublished = versions.find(v => v.status === 'published');

  // Publish a new version
  const publishMutation = useMutation({
    mutationFn: async ({ notes }: { notes?: string }) => {
      if (!stageId) throw new Error('Stage ID required');
      
      const { data, error } = await supabase.rpc('publish_stage_version', {
        p_stage_id: stageId,
        p_notes: notes || null,
      });
      
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stage-versions', stageId] });
      toast({ title: 'Version Published', description: 'New stage version has been published.' });
    },
    onError: (error: any) => {
      toast({ title: 'Publish Failed', description: error.message, variant: 'destructive' });
    },
  });

  // Get diff between two versions
  const getVersionDiff = useCallback(async (fromVersionId: string, toVersionId: string): Promise<VersionDiff | null> => {
    const { data, error } = await supabase.rpc('get_stage_version_diff', {
      p_version_from: fromVersionId,
      p_version_to: toVersionId,
    });
    
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return null;
    }
    
    return data as unknown as VersionDiff;
  }, [toast]);

  // Apply version to package
  const applyVersionMutation = useMutation({
    mutationFn: async ({ 
      packageId, 
      targetVersionId 
    }: { 
      packageId: number; 
      targetVersionId: string;
    }) => {
      if (!stageId) throw new Error('Stage ID required');
      
      const { data, error } = await supabase.rpc('apply_stage_version_to_package', {
        p_package_id: packageId,
        p_stage_id: stageId,
        p_target_version_id: targetVersionId,
      });
      
      if (error) throw error;
      return data as { 
        updated_team_tasks: number; 
        updated_client_tasks: number; 
        updated_emails: number;
        skipped_overrides: number;
      };
    },
    onSuccess: (stats) => {
      toast({ 
        title: 'Version Applied', 
        description: `Updated ${stats.updated_team_tasks} tasks, ${stats.updated_client_tasks} client tasks. ${stats.skipped_overrides} overrides skipped.` 
      });
    },
    onError: (error: any) => {
      toast({ title: 'Apply Failed', description: error.message, variant: 'destructive' });
    },
  });

  // Check if certified stage can be edited
  const checkCertifiedEdit = useCallback(async (): Promise<CertifiedEditCheck | null> => {
    if (!stageId) return null;
    
    const { data, error } = await supabase.rpc('can_edit_certified_stage', {
      p_stage_id: stageId,
    });
    
    if (error) {
      console.error('Error checking certified edit:', error);
      return null;
    }
    
    return data as unknown as CertifiedEditCheck;
  }, [stageId]);

  return {
    versions,
    latestPublished,
    isLoading,
    publishVersion: publishMutation.mutate,
    isPublishing: publishMutation.isPending,
    getVersionDiff,
    applyVersion: applyVersionMutation.mutate,
    isApplying: applyVersionMutation.isPending,
    checkCertifiedEdit,
  };
}

// Hook to get package's current stage version info
export function usePackageStageVersion(packageId: number | null, stageId: number | null) {
  const { data, isLoading } = useQuery({
    queryKey: ['package-stage-version', packageId, stageId],
    queryFn: async () => {
      if (!packageId || !stageId) return null;
      
      const { data, error } = await supabase
        .from('package_stages')
        .select(`
          stage_version_id,
          update_policy,
          last_checked_at,
          stage_versions:stage_version_id (
            id,
            version_number,
            status,
            created_at
          )
        `)
        .eq('package_id', packageId)
        .eq('stage_id', stageId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!packageId && !!stageId,
  });

  // Get latest available version for comparison
  const { data: latestVersion } = useQuery({
    queryKey: ['stage-latest-version', stageId],
    queryFn: async () => {
      if (!stageId) return null;
      
      const { data, error } = await supabase
        .from('stage_versions')
        .select('*')
        .eq('stage_id', stageId)
        .eq('status', 'published')
        .order('version_number', { ascending: false })
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data as unknown as StageVersion | null;
    },
    enabled: !!stageId,
  });

  const currentVersion = data?.stage_versions as unknown as { 
    id: string; 
    version_number: number; 
    status: string; 
    created_at: string; 
  } | null;

  const hasUpdateAvailable = latestVersion && currentVersion 
    ? latestVersion.version_number > currentVersion.version_number 
    : false;

  return {
    currentVersion,
    latestVersion,
    updatePolicy: data?.update_policy,
    lastCheckedAt: data?.last_checked_at,
    hasUpdateAvailable,
    isLoading,
  };
}
