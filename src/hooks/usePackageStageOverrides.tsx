import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Types for override tracking
export interface OverrideItem {
  id: string;
  name: string;
  sourceId: number | null;
  isOverride: boolean;
  isDeleted: boolean;
  type: 'team_task' | 'client_task' | 'email' | 'document';
  packageData: any;
  templateData: any | null;
  diffStatus: 'inherited' | 'overridden' | 'deleted' | 'added' | 'modified';
}

export interface DiffSummary {
  inherited: number;
  overridden: number;
  deleted: number;
  added: number;
  modified: number;
  total: number;
}

export interface PackageOverrideData {
  teamTasks: OverrideItem[];
  clientTasks: OverrideItem[];
  emails: OverrideItem[];
  documents: OverrideItem[];
  diffSummary: DiffSummary;
}

/**
 * Hook to manage package stage overrides with diff tracking
 */
export function usePackageOverrides(packageId: number | null, stageId: number | null) {
  const { toast } = useToast();
  const [data, setData] = useState<PackageOverrideData>({
    teamTasks: [],
    clientTasks: [],
    emails: [],
    documents: [],
    diffSummary: { inherited: 0, overridden: 0, deleted: 0, added: 0, modified: 0, total: 0 }
  });
  const [loading, setLoading] = useState(true);
  const [useOverrides, setUseOverrides] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // Calculate diff status for an item
  const calculateDiffStatus = (
    packageItem: any,
    templateItem: any | null,
    isOverride: boolean,
    isDeleted: boolean
  ): 'inherited' | 'overridden' | 'deleted' | 'added' | 'modified' => {
    if (isDeleted) return 'deleted';
    if (!templateItem && !packageItem.source_stage_task_id && !packageItem.source_stage_email_id && !packageItem.source_stage_document_id) return 'added';
    if (isOverride) return 'overridden';
    return 'inherited';
  };

  // Fetch override data with diff calculation
  const fetchOverrideData = useCallback(async () => {
    if (!packageId || !stageId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch package stage info
      const { data: psData } = await supabase
        .from('package_stages')
        .select('use_overrides, last_synced_at')
        .eq('package_id', packageId)
        .eq('stage_id', stageId)
        .single();

      setUseOverrides(psData?.use_overrides ?? false);
      setLastSyncedAt(psData?.last_synced_at ?? null);

      if (!psData?.use_overrides) {
        setData({
          teamTasks: [],
          clientTasks: [],
          emails: [],
          documents: [],
          diffSummary: { inherited: 0, overridden: 0, deleted: 0, added: 0, modified: 0, total: 0 }
        });
        setLoading(false);
        return;
      }

      // Fetch package content and template content in parallel
      const [
        packageTeamTasks,
        packageClientTasks,
        packageEmails,
        packageDocs,
        templateTeamTasks,
        templateClientTasks,
        templateEmails,
        templateDocs
      ] = await Promise.all([
        supabase.from('package_staff_tasks').select('*').eq('package_id', packageId).eq('stage_id', stageId),
        supabase.from('package_client_tasks').select('*').eq('package_id', packageId).eq('stage_id', stageId),
        supabase.from('package_stage_emails').select('*, email_templates:email_template_id(id, internal_name, subject)').eq('package_id', packageId).eq('stage_id', stageId),
        supabase.from('package_stage_documents').select('*, documents:document_id(id, title, format)').eq('package_id', packageId).eq('stage_id', stageId),
        supabase.from('stage_team_tasks').select('*').eq('stage_id', stageId),
        supabase.from('stage_client_tasks').select('*').eq('stage_id', stageId),
        supabase.from('stage_emails').select('*, email_template:email_templates(id, internal_name, subject)').eq('stage_id', stageId),
        supabase.from('stage_documents').select('*, document:documents(id, title, format)').eq('stage_id', stageId)
      ]);

      // Create lookup maps for templates
      const teamTaskMap = new Map((templateTeamTasks.data || []).map(t => [t.id, t]));
      const clientTaskMap = new Map((templateClientTasks.data || []).map(t => [t.id, t]));
      const emailMap = new Map((templateEmails.data || []).map(e => [e.id, e]));
      const docMap = new Map((templateDocs.data || []).map(d => [d.id, d]));

      // Process team tasks
      const teamTasks: OverrideItem[] = (packageTeamTasks.data || []).map(pt => {
        const template = pt.source_stage_task_id ? teamTaskMap.get(pt.source_stage_task_id) : null;
        return {
          id: pt.id,
          name: pt.name,
          sourceId: pt.source_stage_task_id,
          isOverride: pt.is_override,
          isDeleted: pt.is_deleted,
          type: 'team_task' as const,
          packageData: pt,
          templateData: template,
          diffStatus: calculateDiffStatus(pt, template, pt.is_override, pt.is_deleted)
        };
      });

      // Process client tasks
      const clientTasks: OverrideItem[] = (packageClientTasks.data || []).map(pt => {
        const template = pt.source_stage_task_id ? clientTaskMap.get(pt.source_stage_task_id) : null;
        return {
          id: pt.id,
          name: pt.name,
          sourceId: pt.source_stage_task_id,
          isOverride: pt.is_override,
          isDeleted: pt.is_deleted,
          type: 'client_task' as const,
          packageData: pt,
          templateData: template,
          diffStatus: calculateDiffStatus(pt, template, pt.is_override, pt.is_deleted)
        };
      });

      // Process emails
      const emails: OverrideItem[] = (packageEmails.data || []).map(pe => {
        const template = pe.source_stage_email_id ? emailMap.get(pe.source_stage_email_id) : null;
        return {
          id: pe.id.toString(),
          name: pe.email_templates?.internal_name || 'Email',
          sourceId: pe.source_stage_email_id,
          isOverride: pe.is_override,
          isDeleted: pe.is_deleted,
          type: 'email' as const,
          packageData: pe,
          templateData: template,
          diffStatus: calculateDiffStatus(pe, template, pe.is_override, pe.is_deleted)
        };
      });

      // Process documents
      const documents: OverrideItem[] = (packageDocs.data || []).map(pd => {
        const template = pd.source_stage_document_id ? docMap.get(pd.source_stage_document_id) : null;
        return {
          id: pd.id.toString(),
          name: pd.documents?.title || 'Document',
          sourceId: pd.source_stage_document_id,
          isOverride: pd.is_override,
          isDeleted: pd.is_deleted,
          type: 'document' as const,
          packageData: pd,
          templateData: template,
          diffStatus: calculateDiffStatus(pd, template, pd.is_override, pd.is_deleted)
        };
      });

      // Calculate summary
      const allItems = [...teamTasks, ...clientTasks, ...emails, ...documents];
      const diffSummary: DiffSummary = {
        inherited: allItems.filter(i => i.diffStatus === 'inherited').length,
        overridden: allItems.filter(i => i.diffStatus === 'overridden').length,
        deleted: allItems.filter(i => i.diffStatus === 'deleted').length,
        added: allItems.filter(i => i.diffStatus === 'added').length,
        modified: allItems.filter(i => i.diffStatus === 'modified').length,
        total: allItems.length
      };

      setData({ teamTasks, clientTasks, emails, documents, diffSummary });
    } catch (error) {
      console.error('Failed to fetch override data:', error);
    } finally {
      setLoading(false);
    }
  }, [packageId, stageId]);

  useEffect(() => {
    fetchOverrideData();
  }, [fetchOverrideData]);

  // Mark item as overridden
  const markAsOverride = async (type: 'team_task' | 'client_task' | 'email' | 'document', itemId: string) => {
    let error: any = null;
    
    if (type === 'team_task') {
      const result = await supabase.from('package_staff_tasks').update({ is_override: true }).eq('id', itemId);
      error = result.error;
    } else if (type === 'client_task') {
      const result = await supabase.from('package_client_tasks').update({ is_override: true }).eq('id', itemId);
      error = result.error;
    } else if (type === 'email') {
      const result = await supabase.from('package_stage_emails').update({ is_override: true }).eq('id', itemId as any);
      error = result.error;
    } else if (type === 'document') {
      const result = await supabase.from('package_stage_documents').update({ is_override: true }).eq('id', itemId as any);
      error = result.error;
    }
    if (error) throw error;
    await fetchOverrideData();
  };

  // Reset item to template (copy from template)
  const resetItemToTemplate = async (type: 'team_task' | 'client_task' | 'email' | 'document', itemId: string, sourceId: number) => {
    if (!packageId || !stageId) return;

    try {
      if (type === 'team_task') {
        const { data: template } = await supabase
          .from('stage_team_tasks')
          .select('*')
          .eq('id', sourceId)
          .single();

        if (template) {
          await supabase
            .from('package_staff_tasks')
            .update({
              name: template.name,
              description: template.description,
              order_number: template.sort_order,
              owner_role: template.owner_role,
              estimated_hours: template.estimated_hours,
              is_mandatory: template.is_mandatory,
              is_override: false,
              is_deleted: false
            })
            .eq('id', itemId);
        }
      } else if (type === 'client_task') {
        const { data: template } = await supabase
          .from('stage_client_tasks')
          .select('*')
          .eq('id', sourceId)
          .single();

        if (template) {
          await supabase
            .from('package_client_tasks')
            .update({
              name: template.name,
              description: template.description,
              order_number: template.sort_order,
              instructions: template.instructions,
              required_documents: template.required_documents,
              due_date_offset: template.due_date_offset,
              is_override: false,
              is_deleted: false
            })
            .eq('id', itemId);
        }
      } else if (type === 'email') {
        const { data: template } = await supabase
          .from('stage_emails')
          .select('*')
          .eq('id', sourceId)
          .single();

        if (template) {
          await supabase
            .from('package_stage_emails')
            .update({
              email_template_id: template.email_template_id,
              trigger_type: template.trigger_type,
              recipient_type: template.recipient_type,
              sort_order: template.sort_order,
              is_active: template.is_active,
              is_override: false,
              is_deleted: false
            })
            .eq('id', itemId as any);
        }
      } else if (type === 'document') {
        const { data: template } = await supabase
          .from('stage_documents')
          .select('*')
          .eq('id', sourceId)
          .single();

        if (template) {
          await supabase
            .from('package_stage_documents')
            .update({
              document_id: template.document_id,
              visibility: template.visibility,
              delivery_type: template.delivery_type,
              sort_order: template.sort_order,
              is_override: false,
              is_deleted: false
            })
            .eq('id', itemId as any);
        }
      }

      toast({ title: 'Reset to template' });
      await fetchOverrideData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to reset item',
        variant: 'destructive'
      });
    }
  };

  // Soft delete item (mark as deleted)
  const softDeleteItem = async (type: 'team_task' | 'client_task' | 'email' | 'document', itemId: string) => {
    let error: any = null;
    
    if (type === 'team_task') {
      const result = await supabase.from('package_staff_tasks').update({ is_deleted: true, is_override: true }).eq('id', itemId);
      error = result.error;
    } else if (type === 'client_task') {
      const result = await supabase.from('package_client_tasks').update({ is_deleted: true, is_override: true }).eq('id', itemId);
      error = result.error;
    } else if (type === 'email') {
      const result = await supabase.from('package_stage_emails').update({ is_deleted: true, is_override: true }).eq('id', itemId as any);
      error = result.error;
    } else if (type === 'document') {
      const result = await supabase.from('package_stage_documents').update({ is_deleted: true, is_override: true }).eq('id', itemId as any);
      error = result.error;
    }

    if (error) throw error;
    toast({ title: 'Item removed from package' });
    await fetchOverrideData();
  };

  // Restore deleted item
  const restoreItem = async (type: 'team_task' | 'client_task' | 'email' | 'document', itemId: string) => {
    let error: any = null;
    
    if (type === 'team_task') {
      const result = await supabase.from('package_staff_tasks').update({ is_deleted: false }).eq('id', itemId);
      error = result.error;
    } else if (type === 'client_task') {
      const result = await supabase.from('package_client_tasks').update({ is_deleted: false }).eq('id', itemId);
      error = result.error;
    } else if (type === 'email') {
      const result = await supabase.from('package_stage_emails').update({ is_deleted: false }).eq('id', itemId as any);
      error = result.error;
    } else if (type === 'document') {
      const result = await supabase.from('package_stage_documents').update({ is_deleted: false }).eq('id', itemId as any);
      error = result.error;
    }

    if (error) throw error;
    toast({ title: 'Item restored' });
    await fetchOverrideData();
  };

  return {
    ...data,
    loading,
    useOverrides,
    lastSyncedAt,
    refetch: fetchOverrideData,
    markAsOverride,
    resetItemToTemplate,
    softDeleteItem,
    restoreItem
  };
}

/**
 * Hook to get stage impact summary (how many packages use it, overrides count)
 */
export function useStageImpact(stageId: number | null) {
  const [impact, setImpact] = useState({
    packageCount: 0,
    overrideCount: 0,
    packages: [] as { id: number; name: string; hasOverrides: boolean }[]
  });
  const [loading, setLoading] = useState(true);

  const fetchImpact = useCallback(async () => {
    if (!stageId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('package_stages')
        .select(`
          package_id,
          use_overrides,
          packages:package_id(id, name)
        `)
        .eq('stage_id', stageId);

      if (error) throw error;

      const packages = (data || []).map(ps => ({
        id: ps.package_id,
        name: (ps.packages as any)?.name || 'Unknown',
        hasOverrides: ps.use_overrides ?? false
      }));

      setImpact({
        packageCount: packages.length,
        overrideCount: packages.filter(p => p.hasOverrides).length,
        packages
      });
    } catch (error) {
      console.error('Failed to fetch stage impact:', error);
    } finally {
      setLoading(false);
    }
  }, [stageId]);

  useEffect(() => {
    fetchImpact();
  }, [fetchImpact]);

  return { ...impact, loading, refetch: fetchImpact };
}

/**
 * Hook to sync stage template to packages
 */
export function useSyncStageToPackages() {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);

  const syncToPackages = async (stageId: number) => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.rpc('sync_stage_template_to_packages', {
        p_stage_id: stageId
      });

      if (error) throw error;

      const result = data as { updated_count: number; skipped_count: number; updated: string[] };
      
      toast({
        title: 'Sync Complete',
        description: `Updated ${result.updated_count} package(s). ${result.skipped_count} skipped due to overrides.`
      });

      return result;
    } catch (error: any) {
      toast({
        title: 'Sync Failed',
        description: error.message || 'Failed to sync phase to packages',
        variant: 'destructive'
      });
      throw error;
    } finally {
      setSyncing(false);
    }
  };

  return { syncToPackages, syncing };
}

/**
 * Hook to copy template to package with source tracking
 */
export function useCopyTemplateToPackage() {
  const { toast } = useToast();
  const [copying, setCopying] = useState(false);

  const copyTemplate = async (packageId: number, stageId: number) => {
    setCopying(true);
    try {
      const { error } = await supabase.rpc('copy_stage_template_to_package', {
        p_package_id: packageId,
        p_stage_id: stageId
      });

      if (error) throw error;

      toast({ title: 'Template copied to package with override tracking' });
    } catch (error: any) {
      toast({
        title: 'Copy Failed',
        description: error.message || 'Failed to copy template',
        variant: 'destructive'
      });
      throw error;
    } finally {
      setCopying(false);
    }
  };

  return { copyTemplate, copying };
}
