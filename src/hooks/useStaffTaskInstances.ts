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
  due_date: string | null;
  completion_date: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  assignee_avatar: string | null;
  order_number: number | null;
}

interface UseStaffTaskInstancesProps {
  stageInstanceId: number;
  tenantId: number;
  packageId: number;
}

export function useStaffTaskInstances({ stageInstanceId, tenantId, packageId }: UseStaffTaskInstancesProps) {
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
        .select('id, stafftask_id, status, status_id, due_date, completion_date, assignee_id')
        .eq('stageinstance_id', stageInstanceId)
        .order('id')) as { data: Array<{ id: number; stafftask_id: number | null; status: string | null; status_id: number | null; due_date: string | null; completion_date: string | null; assignee_id: string | null }> | null; error: any };
      
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
              .select('id, name, description, order_number')
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
      type TaskMeta = { id: number; name: string; description: string | null; order_number: number | null };
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
          due_date: row.due_date,
          completion_date: row.completion_date,
          assignee_id: row.assignee_id,
          assignee_name: assignee ? `${assignee.first_name || ''} ${assignee.last_name || ''}`.trim() : null,
          assignee_avatar: assignee?.avatar_url || null,
          order_number: taskMeta?.order_number ?? null,
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

      // Set completion_date if completing
      if (newStatusId === 2 && oldStatusId !== 2) {
        updateData.completion_date = new Date().toISOString().split('T')[0];
      } else if (newStatusId !== 2) {
        updateData.completion_date = null;
      }

      const { error } = await supabase
        .from('staff_task_instances')
        .update(updateData)
        .eq('id', taskId);

      if (error) throw error;

      // Log to audit
      await supabase.from('client_audit_log').insert({
        tenant_id: tenantId,
        actor_user_id: profile?.user_uuid,
        action: 'staff_task_status_changed',
        entity_type: 'staff_task_instances',
        entity_id: taskId.toString(),
        before_data: { status_id: oldStatusId },
        after_data: { status_id: newStatusId },
        details: { package_id: packageId, stage_instance_id: stageInstanceId },
      });

      toast({ 
        title: 'Task Updated', 
        description: `Status changed to ${getStatusLabel(newStatusId, statuses)}` 
      });
      
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

      toast({ title: 'Task Updated', description: 'Assignee changed' });
      fetchTasks();
    } catch (error: any) {
      console.error('Error updating staff task assignee:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setUpdating(null);
    }
  };

  const completedCount = tasks.filter(t => t.status_id === 2).length;
  const totalCount = tasks.length;

  return {
    tasks,
    loading,
    updating,
    updateTaskStatus,
    updateTaskAssignee,
    refetch: fetchTasks,
    completedCount,
    totalCount,
  };
}
