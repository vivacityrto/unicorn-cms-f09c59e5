import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useTaskStatusOptions, getStatusLabel } from '@/hooks/useTaskStatusOptions';
import type { TablesUpdate } from '@/integrations/supabase/types';

export interface ClientTaskInstance {
  id: number;
  client_task_id: number | null;
  task_name: string;
  task_description: string | null;
  status_id: number;
  due_date: string | null;
  completion_date: string | null;
  order_number: number | null;
}

interface UseClientTaskInstancesProps {
  stageInstanceId: number;
  tenantId: number;
  packageId: number;
}

export function useClientTaskInstances({ stageInstanceId, tenantId, packageId }: UseClientTaskInstancesProps) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const { statuses } = useTaskStatusOptions();
  const [tasks, setTasks] = useState<ClientTaskInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!stageInstanceId) return;
    setLoading(true);
    try {
      const taskResult = await supabase
        .from('client_task_instances')
        .select('id, clienttask_id, status, due_date, completion_date')
        .eq('stageinstance_id', stageInstanceId)
        .eq('is_archived', false)
        .order('id');

      if (taskResult.error) throw taskResult.error;
      if (!taskResult.data || taskResult.data.length === 0) {
        setTasks([]);
        setLoading(false);
        return;
      }

      // Look up client task metadata from client_tasks table
      const clientTaskIds = [...new Set(taskResult.data.map(t => t.clienttask_id).filter(Boolean))] as number[];

      const metaResult = clientTaskIds.length > 0
        ? await supabase
            .from('client_tasks')
            .select('id, name, description, sort_order, is_mandatory')
            .in('id', clientTaskIds)
        : { data: [], error: null };

      const taskMap = new Map<number, { name: string; description: string | null; order_number: number | null }>();

      (metaResult.data || []).forEach((t) => {
        taskMap.set(t.id, { name: t.name, description: t.description, order_number: t.sort_order ?? null });
      });

      const transformed: ClientTaskInstance[] = taskResult.data.map((row) => {
        const meta = row.clienttask_id ? taskMap.get(row.clienttask_id) : undefined;
        return {
          id: row.id,
          client_task_id: row.clienttask_id,
          task_name: meta?.name || `Client Task ${row.id}`,
          task_description: meta?.description || null,
          status_id: row.status ?? 0,
          due_date: row.due_date,
          completion_date: row.completion_date,
          order_number: meta?.order_number ?? null,
        };
      });

      transformed.sort((a, b) => {
        if (a.order_number !== null && b.order_number !== null) return a.order_number - b.order_number;
        if (a.order_number !== null) return -1;
        if (b.order_number !== null) return 1;
        return a.id - b.id;
      });

      setTasks(transformed);
    } catch (error) {
      console.error('Error fetching client task instances:', error);
      toast({ title: 'Error', description: 'Failed to load client tasks', variant: 'destructive' });
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
      const updateData: TablesUpdate<'client_task_instances'> = { status: newStatusId };

      if (newStatusId === 2 && oldTask?.status_id !== 2) {
        updateData.completion_date = new Date().toISOString().split('T')[0];
      } else if (newStatusId !== 2) {
        updateData.completion_date = null;
      }

      const { error } = await supabase
        .from('client_task_instances')
        .update(updateData)
        .eq('id', taskId);

      if (error) throw error;

      // Compute structured AI signals
      const aiSignals: {
        package_id: number;
        stage_instance_id: number;
        completion_latency_days?: number;
        completed_on_time?: boolean;
      } = {
        package_id: packageId,
        stage_instance_id: stageInstanceId,
      };
      if (newStatusId === 2 && oldTask?.due_date) {
        const completionDate = new Date();
        const dueDate = new Date(oldTask.due_date);
        aiSignals.completion_latency_days = Math.round((completionDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        aiSignals.completed_on_time = completionDate <= dueDate;
      }

      await supabase.from('client_audit_log').insert({
        tenant_id: tenantId,
        actor_user_id: profile?.user_uuid,
        action: 'client_task_status_changed',
        entity_type: 'client_task_instances',
        entity_id: taskId.toString(),
        before_data: { status: oldTask?.status_id },
        after_data: { status: newStatusId },
        details: aiSignals,
      });

      toast({ title: 'Task Updated', description: `Status changed to ${getStatusLabel(newStatusId, statuses)}` });

      // Auto-promote stage to In Progress if currently Not Started and task is set to anything other than N/A
      if (newStatusId !== 3) {
        const { data: stageData } = await supabase
          .from('stage_instances')
          .select('status')
          .eq('id', stageInstanceId)
          .single();

        const currentStatus = stageData?.status;
        const isNotStarted =
          currentStatus === 'not_started' ||
          currentStatus === '0' ||
          currentStatus === null ||
          currentStatus === undefined;
        if (isNotStarted) {
          const inProgressOption = statuses.find(s => s.code === 1);
          await supabase
            .from('stage_instances')
            .update({ status: inProgressOption?.value || 'in_progress' })
            .eq('id', stageInstanceId);

          await supabase.from('client_audit_log').insert({
            tenant_id: tenantId,
            actor_user_id: profile?.user_uuid,
            action: 'stage_auto_in_progress',
            entity_type: 'stage_instances',
            entity_id: stageInstanceId.toString(),
            after_data: { status: 'in_progress' },
            details: { package_id: packageId, reason: 'client_task_status_changed' },
          });
        }
      }

      fetchTasks();
    } catch (error) {
      console.error('Error updating client task:', error);
      toast({ title: 'Error', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally {
      setUpdating(null);
    }
  };

  const completedCount = tasks.filter(t => t.status_id === 2).length;
  const totalCount = tasks.length;

  return { tasks, loading, updating, updateTaskStatus, refetch: fetchTasks, completedCount, totalCount };
}
