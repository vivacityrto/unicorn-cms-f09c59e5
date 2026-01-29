import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// Status options matching dd_status table
export const CLIENT_TASK_STATUS_OPTIONS = [
  { value: 0, label: 'Not Started', key: 'not_started' },
  { value: 1, label: 'In Progress', key: 'in_progress' },
  { value: 2, label: 'Completed', key: 'completed' },
  { value: 3, label: 'N/A', key: 'na' },
] as const;

export interface ClientPackageInstance {
  id: string;
  tenant_id: number;
  package_id: number;
  status: 'active' | 'paused' | 'closed';
  start_date: string;
  end_date: string | null;
  assigned_csc_user_id: string | null;
  created_at: string;
  created_by: string | null;
  package?: {
    id: number;
    name: string;
    slug: string | null;
  };
  tenant?: {
    id: number;
    name: string;
  };
  stages_count?: number;
  team_tasks_open?: number;
  client_tasks_open?: number;
  emails_queued?: number;
}

export interface ClientPackageStage {
  id: string;
  client_package_id: string;
  stage_id: number;
  sort_order: number;
  status: 'not_started' | 'in_progress' | 'complete' | 'skipped';
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  stage?: {
    id: number;
    title: string;
    short_name: string | null;
    description: string | null;
  };
  team_tasks?: ClientTeamTask[];
  client_tasks?: ClientTask[];
  documents?: ClientStageDocument[];
  emails?: ClientEmailQueue[];
}

export interface ClientTeamTask {
  id: string;
  client_package_stage_id: string;
  template_task_id: string | null;
  name: string;
  instructions: string | null;
  owner_role: string | null;
  estimated_hours: number | null;
  is_mandatory: boolean;
  sort_order: number;
  status: 'open' | 'in_progress' | 'done' | 'blocked';
  created_at: string;
}

export interface ClientTask {
  id: number;
  client_task_id: number | null;
  stage_instance_id: number;
  name: string;
  description: string | null;
  instructions: string | null;
  due_date: string | null;
  completion_date: string | null;
  sort_order: number;
  status: number;
  status_label: string;
  created_at: string;
}

export interface ClientEmailQueue {
  id: string;
  client_package_stage_id: string;
  email_template_id: string;
  trigger_type: string;
  recipient_type: string;
  status: 'queued' | 'sent' | 'skipped';
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface ClientStageDocument {
  id: string;
  client_package_stage_id: string;
  document_id: number;
  visibility: string;
  delivery_type: string;
  sort_order: number;
  created_at: string;
  document?: {
    id: number;
    title: string;
    category: string | null;
    format: string | null;
  };
}

export function useClientPackageInstances() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const startPackage = useCallback(async (
    tenantId: number,
    packageId: number,
    assignedCscUserId?: string
  ): Promise<string | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('start_client_package', {
        p_tenant_id: tenantId,
        p_package_id: packageId,
        p_assigned_csc_user_id: assignedCscUserId || null
      });

      if (error) throw error;

      toast({
        title: 'Package Started',
        description: 'Client package instance created successfully',
      });

      return data as string;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to start package',
        variant: 'destructive'
      });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchClientPackages = useCallback(async (tenantId?: number): Promise<ClientPackageInstance[]> => {
    try {
      // Use package_instances as source of truth
      let query = supabase
        .from('package_instances')
        .select('*')
        .eq('is_complete', false)
        .order('created_at', { ascending: false });

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data: instances, error } = await query;
      if (error) throw error;

      if (!instances || instances.length === 0) return [];

      // Fetch packages and tenants in parallel
      const packageIds = [...new Set(instances.map(i => i.package_id))];
      const tenantIds = [...new Set(instances.map(i => i.tenant_id))];

      const [packagesRes, tenantsRes] = await Promise.all([
        supabase.from('packages').select('id, name, slug').in('id', packageIds),
        supabase.from('tenants').select('id, name').in('id', tenantIds)
      ]);

      const packageMap = new Map((packagesRes.data || []).map(p => [p.id, p]));
      const tenantMap = new Map((tenantsRes.data || []).map(t => [t.id, t]));

      // Map to ClientPackageInstance format
      const mapped: ClientPackageInstance[] = instances.map(inst => ({
        id: inst.id.toString(),
        tenant_id: inst.tenant_id,
        package_id: inst.package_id,
        status: inst.is_complete ? 'closed' : 'active',
        start_date: inst.start_date || '',
        end_date: inst.end_date,
        assigned_csc_user_id: inst.manager_id,
        created_at: inst.start_date || '',
        created_by: null,
        package: packageMap.get(inst.package_id) || { id: inst.package_id, name: 'Unknown', slug: null },
        tenant: tenantMap.get(inst.tenant_id) || { id: inst.tenant_id, name: 'Unknown' }
      }));

      return mapped;
    } catch (error: any) {
      console.error('Error fetching client packages:', error);
      return [];
    }
  }, []);

  const fetchPackageDetail = useCallback(async (clientPackageId: string): Promise<ClientPackageInstance | null> => {
    try {
      // Fetch from package_instances
      const { data: inst, error } = await supabase
        .from('package_instances')
        .select('*')
        .eq('id', parseInt(clientPackageId))
        .single();

      if (error) throw error;
      if (!inst) return null;

      // Fetch package and tenant details in parallel
      const [packageRes, tenantRes] = await Promise.all([
        supabase.from('packages').select('id, name, slug').eq('id', inst.package_id).single(),
        supabase.from('tenants').select('id, name').eq('id', inst.tenant_id).single()
      ]);

      return {
        id: inst.id.toString(),
        tenant_id: inst.tenant_id,
        package_id: inst.package_id,
        status: inst.is_complete ? 'closed' : 'active',
        start_date: inst.start_date || '',
        end_date: inst.end_date,
        assigned_csc_user_id: inst.manager_id,
        created_at: inst.start_date || '',
        created_by: null,
        package: packageRes.data || { id: inst.package_id, name: 'Unknown', slug: null },
        tenant: tenantRes.data || { id: inst.tenant_id, name: 'Unknown' }
      };
    } catch (error: any) {
      console.error('Error fetching package detail:', error);
      return null;
    }
  }, []);

  const fetchPackageStages = useCallback(async (clientPackageId: string): Promise<ClientPackageStage[]> => {
    try {
      const { data: stages, error } = await supabase
        .from('client_package_stages')
        .select(`
          *,
          stage:documents_stages(id, title, short_name, description)
        `)
        .eq('client_package_id', clientPackageId)
        .order('sort_order');

      if (error) throw error;

      // Fetch related data for each stage
      const stagesWithDetails = await Promise.all((stages || []).map(async (stage) => {
        const [teamTasks, clientTasks, documents, emails] = await Promise.all([
          supabase
            .from('client_team_tasks')
            .select('*')
            .eq('client_package_stage_id', stage.id)
            .order('sort_order'),
          supabase
            .from('client_task_instances')
            .select('id, clienttask_id, stageinstance_id, status, due_date, completion_date, created_at')
            .eq('stageinstance_id', parseInt(stage.id)),
          supabase
            .from('client_stage_documents')
            .select(`
              *,
              document:documents(id, title, category, format)
            `)
            .eq('client_package_stage_id', stage.id)
            .order('sort_order'),
          supabase
            .from('client_email_queue')
            .select('*')
            .eq('client_package_stage_id', stage.id)
        ]);

        // Get unique client_task_ids for template lookup
        const clientTaskIds = [...new Set(
          (clientTasks.data || [])
            .map(t => t.clienttask_id)
            .filter(Boolean)
        )] as number[];

        // Batch fetch template metadata
        const { data: clientTaskTemplates } = clientTaskIds.length > 0
          ? await supabase
              .from('client_tasks')
              .select('id, name, description, instructions, sort_order')
              .in('id', clientTaskIds)
          : { data: [] };

        // Build lookup map and transform
        const templateMap = new Map(
          (clientTaskTemplates || []).map(t => [t.id, t])
        );

        const transformedClientTasks: ClientTask[] = (clientTasks.data || []).map(inst => {
          const template = inst.clienttask_id ? templateMap.get(inst.clienttask_id) : null;
          const statusOption = CLIENT_TASK_STATUS_OPTIONS.find(s => s.value === inst.status);
          return {
            id: inst.id,
            client_task_id: inst.clienttask_id,
            stage_instance_id: inst.stageinstance_id,
            name: template?.name || `Task ${inst.id}`,
            description: template?.description || null,
            instructions: template?.instructions || null,
            due_date: inst.due_date,
            completion_date: inst.completion_date,
            sort_order: template?.sort_order ?? 0,
            status: inst.status ?? 0,
            status_label: statusOption?.label || 'Unknown',
            created_at: inst.created_at,
          };
        }).sort((a, b) => a.sort_order - b.sort_order);

        return {
          ...stage,
          team_tasks: teamTasks.data || [],
          client_tasks: transformedClientTasks,
          documents: documents.data || [],
          emails: emails.data || []
        };
      }));

      return stagesWithDetails as ClientPackageStage[];
    } catch (error: any) {
      console.error('Error fetching package stages:', error);
      return [];
    }
  }, []);

  const updateStageStatus = useCallback(async (
    stageId: string,
    status: 'not_started' | 'in_progress' | 'complete' | 'skipped'
  ) => {
    try {
      const updates: any = { status };
      if (status === 'in_progress' && !updates.started_at) {
        updates.started_at = new Date().toISOString();
      }
      if (status === 'complete') {
        updates.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('client_package_stages')
        .update(updates)
        .eq('id', stageId);

      if (error) throw error;
      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update stage status',
        variant: 'destructive'
      });
      return false;
    }
  }, [toast]);

  const updateTeamTaskStatus = useCallback(async (
    taskId: string,
    status: 'open' | 'in_progress' | 'done' | 'blocked'
  ) => {
    try {
      const { error } = await supabase
        .from('client_team_tasks')
        .update({ status })
        .eq('id', taskId);

      if (error) throw error;
      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update task status',
        variant: 'destructive'
      });
      return false;
    }
  }, [toast]);

  const updateClientTaskStatus = useCallback(async (
    taskId: number,
    newStatus: number
  ) => {
    try {
      const updateData: Record<string, any> = { status: newStatus };
      
      // Set completion_date if completing (status 2)
      if (newStatus === 2) {
        updateData.completion_date = new Date().toISOString();
      } else {
        updateData.completion_date = null;
      }

      const { error } = await supabase
        .from('client_task_instances')
        .update(updateData)
        .eq('id', taskId);

      if (error) throw error;
      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update task status',
        variant: 'destructive'
      });
      return false;
    }
  }, [toast]);

  return {
    loading,
    startPackage,
    fetchClientPackages,
    fetchPackageDetail,
    fetchPackageStages,
    updateStageStatus,
    updateTeamTaskStatus,
    updateClientTaskStatus
  };
}
