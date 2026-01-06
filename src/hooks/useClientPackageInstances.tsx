import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  id: string;
  client_package_stage_id: string;
  template_task_id: string | null;
  name: string;
  instructions: string | null;
  due_date: string | null;
  sort_order: number;
  status: 'open' | 'submitted' | 'done';
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
      let query = supabase
        .from('client_packages')
        .select(`
          *,
          package:packages(id, name, slug),
          tenant:tenants(id, name)
        `)
        .order('created_at', { ascending: false });

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Get counts for each package
      const packagesWithCounts = await Promise.all((data || []).map(async (pkg) => {
        const [stagesRes, teamTasksRes, clientTasksRes, emailsRes] = await Promise.all([
          supabase
            .from('client_package_stages')
            .select('id', { count: 'exact', head: true })
            .eq('client_package_id', pkg.id),
          supabase
            .from('client_team_tasks')
            .select('id', { count: 'exact', head: true })
            .in('client_package_stage_id', 
              (await supabase.from('client_package_stages').select('id').eq('client_package_id', pkg.id)).data?.map(s => s.id) || []
            )
            .eq('status', 'open'),
          supabase
            .from('client_tasks')
            .select('id', { count: 'exact', head: true })
            .in('client_package_stage_id',
              (await supabase.from('client_package_stages').select('id').eq('client_package_id', pkg.id)).data?.map(s => s.id) || []
            )
            .eq('status', 'open'),
          supabase
            .from('client_email_queue')
            .select('id', { count: 'exact', head: true })
            .in('client_package_stage_id',
              (await supabase.from('client_package_stages').select('id').eq('client_package_id', pkg.id)).data?.map(s => s.id) || []
            )
            .eq('status', 'queued')
        ]);

        return {
          ...pkg,
          stages_count: stagesRes.count || 0,
          team_tasks_open: teamTasksRes.count || 0,
          client_tasks_open: clientTasksRes.count || 0,
          emails_queued: emailsRes.count || 0
        };
      }));

      return packagesWithCounts as ClientPackageInstance[];
    } catch (error: any) {
      console.error('Error fetching client packages:', error);
      return [];
    }
  }, []);

  const fetchPackageDetail = useCallback(async (clientPackageId: string): Promise<ClientPackageInstance | null> => {
    try {
      const { data, error } = await supabase
        .from('client_packages')
        .select(`
          *,
          package:packages(id, name, slug),
          tenant:tenants(id, name)
        `)
        .eq('id', clientPackageId)
        .single();

      if (error) throw error;
      return data as ClientPackageInstance;
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
            .from('client_tasks')
            .select('*')
            .eq('client_package_stage_id', stage.id)
            .order('sort_order'),
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

        return {
          ...stage,
          team_tasks: teamTasks.data || [],
          client_tasks: clientTasks.data || [],
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
    taskId: string,
    status: 'open' | 'submitted' | 'done'
  ) => {
    try {
      const { error } = await supabase
        .from('client_tasks')
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
