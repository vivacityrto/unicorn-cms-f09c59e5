import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useTaskStatusOptions, getStatusLabel } from '@/hooks/useTaskStatusOptions';

export interface StaffTaskInstance {
  id: number;
  staff_task_id: number | null;
  task_name: string;
  task_description: string | null;
  status: string;
  status_id: number;
  is_core: boolean;
  is_recurring: boolean;
  due_date: string | null;
  completion_date: string | null;
  completed_by: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_avatar: string | null;
  order_number: number | null;
  notes: string | null;
  updated_at: string | null;
}

interface UseStaffTaskInstancesProps {
  stageInstanceId: number;
  tenantId: number;
  packageId: number;
  clientId?: string;
}

export function useStaffTaskInstances({ stageInstanceId, tenantId, packageId, clientId }: UseStaffTaskInstancesProps) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const { statuses } = useTaskStatusOptions();
  const [tasks, setTasks] = useState<StaffTaskInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!stageInstanceId) return;
    
    setLoading(true);
    try {
      // Fetch staff_task_instances for this stage_instance
      const taskResult = await (supabase
        .from('staff_task_instances' as any)
        .select('id, stafftask_id, status, status_id, is_core, due_date, completion_date, completed_by, assignee_id, notes, updated_at')
        .eq('stageinstance_id', stageInstanceId)
        .order('id')) as { data: Array<{ id: number; stafftask_id: number | null; status: string | null; status_id: number | null; is_core: boolean | null; due_date: string | null; completion_date: string | null; completed_by: string | null; assignee_id: string | null; notes: string | null; updated_at: string | null }> | null; error: any };
      
      const instanceData = taskResult.data;
      const instanceError = taskResult.error;

      if (instanceError) throw instanceError;

      if (instanceError) throw instanceError;

      if (!instanceData || instanceData.length === 0) {
        setTasks([]);
        setLoading(false);
        return;
      }

      // Get unique staff_task_ids for metadata lookup
      const staffTaskIds = [...new Set(instanceData.map(t => t.stafftask_id).filter(Boolean))] as number[];
      
      // Get unique assignee_ids for user lookup
      const assigneeIds = [...new Set(instanceData.map(t => t.assignee_id).filter(Boolean))] as string[];

      // Fetch staff_tasks metadata and users in parallel
      const [tasksResult, usersResult] = await Promise.all([
        staffTaskIds.length > 0
          ? supabase
              .from('staff_tasks')
              .select('id, name, description, order_number, is_recurring')
              .in('id', staffTaskIds)
          : Promise.resolve({ data: [], error: null }),
        assigneeIds.length > 0
          ? supabase
              .from('users')
              .select('user_uuid, first_name, last_name, avatar_url')
              .in('user_uuid', assigneeIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (tasksResult.error) throw tasksResult.error;
      if (usersResult.error) throw usersResult.error;

      // Create lookup maps with proper typing
      type TaskMeta = { id: number; name: string; description: string | null; order_number: number | null; is_recurring: boolean | null };
      type UserMeta = { user_uuid: string; first_name: string | null; last_name: string | null; avatar_url: string | null };
      
      const taskMap = new Map<number, TaskMeta>(
        (tasksResult.data || []).map(t => [t.id, t as TaskMeta])
      );
      const userMap = new Map<string, UserMeta>(
        (usersResult.data || []).map(u => [u.user_uuid, u as UserMeta])
      );

      // Transform data
      const transformed: StaffTaskInstance[] = instanceData.map((row) => {
        const taskMeta = row.stafftask_id ? taskMap.get(row.stafftask_id) : undefined;
        const assignee = row.assignee_id ? userMap.get(row.assignee_id) : undefined;

        return {
          id: row.id,
          staff_task_id: row.stafftask_id,
          task_name: taskMeta?.name || `Task ${row.id}`,
          task_description: taskMeta?.description || null,
          status: row.status || 'not_started',
          status_id: row.status_id ?? 0,
          is_core: row.is_core ?? true,
          is_recurring: taskMeta?.is_recurring ?? false,
          due_date: row.due_date,
          completion_date: row.completion_date,
          completed_by: row.completed_by,
          assignee_id: row.assignee_id,
          assignee_name: assignee ? `${assignee.first_name || ''} ${assignee.last_name || ''}`.trim() : null,
          assignee_avatar: assignee?.avatar_url || null,
          order_number: taskMeta?.order_number ?? null,
          notes: row.notes || null,
          updated_at: row.updated_at || null,
        };
      });

      // Sort by order_number, then by id
      transformed.sort((a, b) => {
        if (a.order_number !== null && b.order_number !== null) {
          return a.order_number - b.order_number;
        }
        if (a.order_number !== null) return -1;
        if (b.order_number !== null) return 1;
        return a.id - b.id;
      });

      setTasks(transformed);
    } catch (error: any) {
      console.error('Error fetching staff task instances:', error);
      toast({ title: 'Error', description: 'Failed to load staff tasks', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [stageInstanceId, toast]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const updateTaskStatus = async (taskId: number, newStatusId: number) => {
    setUpdating(taskId);
    
    try {
      const oldTask = tasks.find(t => t.id === taskId);
      const oldStatusId = oldTask?.status_id;
      const statusOption = statuses.find(s => s.code === newStatusId);

      const updateData: Record<string, any> = {
        status_id: newStatusId,
        status: statusOption?.value || 'not_started',
      };

      // Set completion_date and completed_by if completing (status 2 or 4)
      if ((newStatusId === 2 || newStatusId === 4) && oldStatusId !== 2 && oldStatusId !== 4) {
        updateData.completion_date = new Date().toISOString().split('T')[0];
        updateData.completed_by = profile?.user_uuid || null;
      } else if (newStatusId !== 2 && newStatusId !== 4) {
        updateData.completion_date = null;
        updateData.completed_by = null;
      }

      const { error } = await supabase
        .from('staff_task_instances')
        .update(updateData)
        .eq('id', taskId);

      if (error) throw error;

      // Compute structured AI signals
      const aiSignals: Record<string, any> = {
        package_id: packageId,
        stage_instance_id: stageInstanceId,
      };
      if (newStatusId === 2 && oldTask?.due_date) {
        const completionDate = new Date();
        const dueDate = new Date(oldTask.due_date);
        aiSignals.completion_latency_days = Math.round((completionDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        aiSignals.completed_on_time = completionDate <= dueDate;
      }

      // Log to audit
      await supabase.from('client_audit_log').insert({
        tenant_id: tenantId,
        actor_user_id: profile?.user_uuid,
        action: 'staff_task_status_changed',
        entity_type: 'staff_task_instances',
        entity_id: taskId.toString(),
        before_data: { status_id: oldStatusId },
        after_data: { status_id: newStatusId },
        details: aiSignals,
      });

      toast({ 
        title: 'Task Updated', 
        description: `Status changed to ${getStatusLabel(newStatusId, statuses)}` 
      });

      // Auto-complete stage if all active (non-N/A) tasks are now done
      // Build updated task list with the change applied
      const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, status_id: newStatusId } : t);
      const activeTasks = updatedTasks.filter(t => t.status_id !== 3); // exclude N/A
      const hasNaTasks = updatedTasks.some(t => t.status_id === 3);
      const allActiveDone = activeTasks.length > 0 && activeTasks.every(t => t.status_id === 2 || t.status_id === 4);

      if (allActiveDone) {
        const newStageStatus = hasNaTasks ? 4 : 2; // Core Complete if N/A exists, else Completed
        const stageStatusOption = statuses.find(s => s.code === newStageStatus);
        const stageUpdateData: Record<string, any> = {
          status_id: newStageStatus,
          status: stageStatusOption?.value || 'completed',
        };
        if (newStageStatus === 2 || newStageStatus === 4) {
          stageUpdateData.completion_date = new Date().toISOString().split('T')[0];
        }

        await supabase
          .from('stage_instances')
          .update(stageUpdateData)
          .eq('id', stageInstanceId);

        await supabase.from('client_audit_log').insert({
          tenant_id: tenantId,
          actor_user_id: profile?.user_uuid,
          action: 'stage_auto_completed',
          entity_type: 'stage_instances',
          entity_id: stageInstanceId.toString(),
          after_data: { status_id: newStageStatus },
          details: { package_id: packageId, reason: hasNaTasks ? 'all_active_done_with_na' : 'all_tasks_completed' },
        });

        toast({
          title: 'Stage Auto-Completed',
          description: `Stage marked as ${getStatusLabel(newStageStatus, statuses)}`,
        });
      }
      
      fetchTasks();
    } catch (error: any) {
      console.error('Error updating staff task instance:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setUpdating(null);
    }
  };

  const updateTaskAssignee = async (taskId: number, assigneeId: string | null) => {
    setUpdating(taskId);
    
    try {
      const oldTask = tasks.find(t => t.id === taskId);
      const oldAssigneeId = oldTask?.assignee_id;

      const { error } = await supabase
        .from('staff_task_instances')
        .update({ assignee_id: assigneeId })
        .eq('id', taskId);

      if (error) throw error;

      // Log to audit
      await supabase.from('client_audit_log').insert({
        tenant_id: tenantId,
        actor_user_id: profile?.user_uuid,
        action: 'staff_task_assignee_changed',
        entity_type: 'staff_task_instances',
        entity_id: taskId.toString(),
        before_data: { assignee_id: oldAssigneeId },
        after_data: { assignee_id: assigneeId },
        details: { package_id: packageId, stage_instance_id: stageInstanceId },
      });

      // Auto-create action item when assigning (not when unassigning)
      if (assigneeId && clientId) {
        try {
          // Build a descriptive title and description
          const delegatorName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Unknown';
          const rawDesc = (oldTask?.task_description || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
          const descSnippet = rawDesc.length > 50 ? rawDesc.slice(0, 50) + '…' : rawDesc;
          const actionDesc = `Task delegated by: ${delegatorName}${descSnippet ? '\n' + descSnippet : ''}`;

          await supabase.rpc('rpc_create_action_item', {
            p_tenant_id: tenantId,
            p_client_id: clientId,
            p_title: oldTask?.task_name || `Staff Task ${taskId}`,
            p_description: actionDesc,
            p_owner_user_id: assigneeId,
            p_due_date: oldTask?.due_date ? oldTask.due_date.split('T')[0] : null,
            p_priority: 'medium',
            p_source: 'task_assignment',
            p_related_entity_type: 'staff_task_instance',
            p_related_entity_id: taskId.toString(),
          });
        } catch (actionErr: any) {
          console.error('Auto-create action failed:', actionErr);
          // Non-blocking — assignment still succeeded
        }
      }

      toast({ title: 'Task Updated', description: 'Assignee changed' });
      fetchTasks();
    } catch (error: any) {
      console.error('Error updating staff task assignee:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setUpdating(null);
    }
  };

  const updateTaskCore = async (taskId: number, isCore: boolean) => {
    setUpdating(taskId);
    
    try {
      const oldTask = tasks.find(t => t.id === taskId);
      const oldIsCore = oldTask?.is_core;

      const { error } = await supabase
        .from('staff_task_instances')
        .update({ is_core: isCore })
        .eq('id', taskId);

      if (error) throw error;

      // Log to audit
      await supabase.from('client_audit_log').insert({
        tenant_id: tenantId,
        actor_user_id: profile?.user_uuid,
        action: 'staff_task_core_changed',
        entity_type: 'staff_task_instances',
        entity_id: taskId.toString(),
        before_data: { is_core: oldIsCore },
        after_data: { is_core: isCore },
        details: { package_id: packageId, stage_instance_id: stageInstanceId },
      });

      toast({ title: 'Task Updated', description: `Task marked as ${isCore ? 'core' : 'non-core'}` });
      fetchTasks();
    } catch (error: any) {
      console.error('Error updating staff task core status:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setUpdating(null);
    }
  };

  const completedCount = tasks.filter(t => t.status_id === 2 || t.status_id === 4).length;
  const totalCount = tasks.filter(t => t.status_id !== 3).length;

  return {
    tasks,
    loading,
    updating,
    updateTaskStatus,
    updateTaskAssignee,
    updateTaskCore,
    refetch: fetchTasks,
    completedCount,
    totalCount,
  };
}
