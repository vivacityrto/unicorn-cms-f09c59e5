import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

import { getStatusLabel } from '@/hooks/useTaskStatusOptions';

// Maps used by updateStageStatus / updateTeamTaskStatus RPCs
export const STAGE_STATUS_MAP: Record<string, { status_id: number; status: string }> = {
  not_started: { status_id: 0, status: 'Not Started' },
  in_progress: { status_id: 1, status: 'In Progress' },
  complete: { status_id: 2, status: 'Completed' },
  skipped: { status_id: 3, status: 'N/A' },
};

export const STAFF_TASK_STATUS_MAP: Record<string, { status_id: number; status: string }> = {
  open: { status_id: 0, status: 'Not Started' },
  in_progress: { status_id: 1, status: 'In Progress' },
  done: { status_id: 2, status: 'Completed' },
  blocked: { status_id: 3, status: 'N/A' },
};

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
  id: number;
  packageinstance_id: number;
  stage_id: number;
  sort_order: number;
  status: string;
  status_id: number;
  is_recurring: boolean;
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
  id: number;
  stafftask_id: number | null;
  stageinstance_id: number;
  status_id: number;
  status: string;
  name: string;
  description: string | null;
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
  id: number;
  email_id: number | null;
  stageinstance_id: number;
  subject: string | null;
  content: string | null;
  is_sent: boolean;
  sent_date: string | null;
}

export interface ClientStageDocument {
  id: number;
  document_id: number | null;
  stageinstance_id: number;
  tenant_id: number | null;
  status: string | null;
  isgenerated: boolean;
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
  ): Promise<number | null> => {
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

      return data as number;
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

      const packageIds = [...new Set(instances.map(i => i.package_id))];
      const tenantIds = [...new Set(instances.map(i => i.tenant_id))];

      const [packagesRes, tenantsRes] = await Promise.all([
        supabase.from('packages').select('id, name, slug').in('id', packageIds),
        supabase.from('tenants').select('id, name').in('id', tenantIds)
      ]);

      const packageMap = new Map((packagesRes.data || []).map(p => [p.id, p]));
      const tenantMap = new Map((tenantsRes.data || []).map(t => [t.id, t]));

      return instances.map(inst => ({
        id: inst.id.toString(),
        tenant_id: inst.tenant_id,
        package_id: inst.package_id,
        status: inst.is_complete ? 'closed' as const : 'active' as const,
        start_date: inst.start_date || '',
        end_date: inst.end_date,
        assigned_csc_user_id: inst.manager_id,
        created_at: inst.start_date || '',
        created_by: null,
        package: packageMap.get(inst.package_id) || { id: inst.package_id, name: 'Unknown', slug: null },
        tenant: tenantMap.get(inst.tenant_id) || { id: inst.tenant_id, name: 'Unknown' }
      }));
    } catch (error: any) {
      console.error('Error fetching client packages:', error);
      return [];
    }
  }, []);

  const fetchPackageDetail = useCallback(async (clientPackageId: string): Promise<ClientPackageInstance | null> => {
    try {
      const { data: inst, error } = await supabase
        .from('package_instances')
        .select('*')
        .eq('id', parseInt(clientPackageId))
        .single();

      if (error) throw error;
      if (!inst) return null;

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
      const packageInstanceId = parseInt(clientPackageId);

      // Fetch stage_instances for this package instance
      const { data: stageRows, error: stageError } = await (supabase
        .from('stage_instances' as any)
        .select('id, stage_id, packageinstance_id, stage_sortorder, status_id, status, is_recurring')
        .eq('packageinstance_id', packageInstanceId)
        .order('stage_sortorder')) as { data: any[] | null; error: any };

      if (stageError) throw stageError;
      if (!stageRows || stageRows.length === 0) return [];

      // Get unique stage_ids for metadata lookup
      const stageIds = [...new Set(stageRows.map(s => s.stage_id))] as number[];
      const stageInstanceIds = stageRows.map(s => s.id) as number[];

      // Fetch stage metadata from stages
      const { data: stageMetaRaw } = stageIds.length > 0
        ? await supabase.from('stages').select('id, name, shortname, description').in('id', stageIds)
        : { data: [] };
      const stageMeta = (stageMetaRaw || []).map((s: any) => ({ id: s.id, title: s.name, short_name: s.shortname, description: s.description }));

      const stageMetaMap = new Map((stageMeta || []).map(s => [s.id, s]));

      // Fetch all related data in parallel
      const [staffTasksRes, clientTasksRes, docsRes, emailsRes] = await Promise.all([
        supabase
          .from('staff_task_instances' as any)
          .select('id, stafftask_id, stageinstance_id, status_id, status')
          .in('stageinstance_id', stageInstanceIds),
        supabase
          .from('client_task_instances')
          .select('id, clienttask_id, stageinstance_id, status, due_date, completion_date, created_at')
          .in('stageinstance_id', stageInstanceIds),
        supabase
          .from('document_instances' as any)
          .select('id, document_id, stageinstance_id, tenant_id, status, isgenerated')
          .in('stageinstance_id', stageInstanceIds),
        supabase
          .from('email_instances' as any)
          .select('id, email_id, stageinstance_id, subject, content, is_sent, sent_date')
          .in('stageinstance_id', stageInstanceIds),
      ]) as [any, any, any, any];

      // Fetch staff_tasks and client_tasks templates for names
      const staffTaskIds = [...new Set((staffTasksRes.data || []).map((t: any) => t.stafftask_id).filter(Boolean))] as number[];
      const clientTaskIds = [...new Set((clientTasksRes.data || []).map((t: any) => t.clienttask_id).filter(Boolean))] as number[];
      const documentIds = [...new Set((docsRes.data || []).map((d: any) => d.document_id).filter(Boolean))] as number[];

      const [staffTaskMeta, clientTaskMeta, docMeta] = await Promise.all([
        staffTaskIds.length > 0
          ? supabase.from('staff_tasks').select('id, name, description').in('id', staffTaskIds)
          : Promise.resolve({ data: [] }),
        clientTaskIds.length > 0
          ? supabase.from('client_tasks').select('id, name, description, instructions, sort_order').in('id', clientTaskIds)
          : Promise.resolve({ data: [] }),
        documentIds.length > 0
          ? supabase.from('documents').select('id, title, category, format').in('id', documentIds)
          : Promise.resolve({ data: [] }),
      ]);

      const staffTaskMap = new Map((staffTaskMeta.data || []).map((t: any) => [t.id, t]));
      const clientTaskMap = new Map((clientTaskMeta.data || []).map((t: any) => [t.id, t]));
      const docMap = new Map((docMeta.data || []).map((d: any) => [d.id, d]));

      // Group by stageinstance_id
      const staffTasksByStage = new Map<number, any[]>();
      for (const t of (staffTasksRes.data || [])) {
        const arr = staffTasksByStage.get(t.stageinstance_id) || [];
        arr.push(t);
        staffTasksByStage.set(t.stageinstance_id, arr);
      }

      const clientTasksByStage = new Map<number, any[]>();
      for (const t of (clientTasksRes.data || [])) {
        const arr = clientTasksByStage.get(t.stageinstance_id) || [];
        arr.push(t);
        clientTasksByStage.set(t.stageinstance_id, arr);
      }

      const docsByStage = new Map<number, any[]>();
      for (const d of (docsRes.data || [])) {
        const arr = docsByStage.get(d.stageinstance_id) || [];
        arr.push(d);
        docsByStage.set(d.stageinstance_id, arr);
      }

      const emailsByStage = new Map<number, any[]>();
      for (const e of (emailsRes.data || [])) {
        const arr = emailsByStage.get(e.stageinstance_id) || [];
        arr.push(e);
        emailsByStage.set(e.stageinstance_id, arr);
      }

      // Transform
      return stageRows.map((stage: any) => {
        const meta = stageMetaMap.get(stage.stage_id);

        const teamTasks: ClientTeamTask[] = (staffTasksByStage.get(stage.id) || []).map((t: any) => {
          const tmpl = t.stafftask_id ? staffTaskMap.get(t.stafftask_id) : null;
          return {
            id: t.id,
            stafftask_id: t.stafftask_id,
            stageinstance_id: t.stageinstance_id,
            status_id: t.status_id ?? 0,
            status: t.status || 'Not Started',
            name: tmpl?.name || `Task ${t.id}`,
            description: tmpl?.description || null,
          };
        });

        const clientTasks: ClientTask[] = (clientTasksByStage.get(stage.id) || []).map((inst: any) => {
          const tmpl = inst.clienttask_id ? clientTaskMap.get(inst.clienttask_id) : null;
          const statusLabel = getStatusLabel(inst.status ?? 0);
          return {
            id: inst.id,
            client_task_id: inst.clienttask_id,
            stage_instance_id: inst.stageinstance_id,
            name: tmpl?.name || `Task ${inst.id}`,
            description: tmpl?.description || null,
            instructions: tmpl?.instructions || null,
            due_date: inst.due_date,
            completion_date: inst.completion_date,
            sort_order: tmpl?.sort_order ?? 0,
            status: inst.status ?? 0,
            status_label: statusLabel,
            created_at: inst.created_at,
          };
        }).sort((a: ClientTask, b: ClientTask) => a.sort_order - b.sort_order);

        const documents: ClientStageDocument[] = (docsByStage.get(stage.id) || []).map((d: any) => {
          const dm = d.document_id ? docMap.get(d.document_id) : null;
          return {
            id: d.id,
            document_id: d.document_id,
            stageinstance_id: d.stageinstance_id,
            tenant_id: d.tenant_id,
            status: d.status,
            isgenerated: d.isgenerated,
            document: dm ? { id: dm.id, title: dm.title, category: dm.category, format: dm.format } : undefined,
          };
        });

        const emails: ClientEmailQueue[] = (emailsByStage.get(stage.id) || []).map((e: any) => ({
          id: e.id,
          email_id: e.email_id,
          stageinstance_id: e.stageinstance_id,
          subject: e.subject,
          content: e.content,
          is_sent: e.is_sent,
          sent_date: e.sent_date,
        }));

        return {
          id: stage.id,
          packageinstance_id: stage.packageinstance_id,
          stage_id: stage.stage_id,
          sort_order: stage.stage_sortorder ?? 0,
          status: stage.status || 'Not Started',
          status_id: stage.status_id ?? 0,
          is_recurring: stage.is_recurring ?? false,
          stage: meta ? { id: meta.id, title: meta.title, short_name: meta.short_name, description: meta.description } : undefined,
          team_tasks: teamTasks,
          client_tasks: clientTasks,
          documents,
          emails,
        } as ClientPackageStage;
      });
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
      const mapped = STAGE_STATUS_MAP[status] || STAGE_STATUS_MAP.not_started;

      const { error } = await supabase
        .from('stage_instances' as any)
        .update({ status_id: mapped.status_id, status: mapped.status })
        .eq('id', parseInt(stageId));

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
      const mapped = STAFF_TASK_STATUS_MAP[status] || STAFF_TASK_STATUS_MAP.open;

      const { error } = await supabase
        .from('staff_task_instances' as any)
        .update({ status_id: mapped.status_id, status: mapped.status })
        .eq('id', parseInt(taskId));

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
