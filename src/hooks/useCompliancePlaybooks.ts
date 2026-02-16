import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CompliancePlaybook {
  id: string;
  name: string;
  description: string;
  trigger_type: string;
  related_standard_clauses: string[];
  severity_level: string;
  active_flag: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlaybookStep {
  id: string;
  playbook_id: string;
  step_order: number;
  step_type: string;
  step_description: string;
  suggested_task_template_id: string | null;
  requires_confirmation: boolean;
}

export interface PlaybookActivation {
  id: string;
  playbook_id: string;
  tenant_id: number;
  stage_instance_id: string | null;
  trigger_source_id: string | null;
  activation_reason: string;
  activation_status: 'suggested' | 'initiated' | 'completed' | 'dismissed';
  current_step_order: number;
  adaptive_context_json: Record<string, any>;
  activated_at: string;
  completed_at: string | null;
  compliance_playbooks?: CompliancePlaybook;
}

export interface PlaybookOverview {
  suggested30d: number;
  initiated30d: number;
  completed30d: number;
  dismissed30d: number;
  initiationRate: number;
  completionRate: number;
  topTriggerType: string;
}

export function usePlaybookActivations(tenantId?: number) {
  return useQuery({
    queryKey: ['playbook-activations', tenantId],
    queryFn: async () => {
      let query = supabase
        .from('playbook_activations')
        .select('*, compliance_playbooks(*)')
        .order('activated_at', { ascending: false });

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return (data || []) as PlaybookActivation[];
    },
    enabled: tenantId !== undefined ? tenantId > 0 : true,
  });
}

export function usePlaybookSteps(playbookId?: string) {
  return useQuery({
    queryKey: ['playbook-steps', playbookId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('playbook_steps')
        .select('*')
        .eq('playbook_id', playbookId!)
        .order('step_order', { ascending: true });
      if (error) throw error;
      return (data || []) as PlaybookStep[];
    },
    enabled: !!playbookId,
  });
}

export function usePlaybookOverview() {
  return useQuery({
    queryKey: ['playbook-overview'],
    queryFn: async () => {
      const d30ago = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data, error } = await supabase
        .from('playbook_activations')
        .select('activation_status, compliance_playbooks(trigger_type)')
        .gte('activated_at', d30ago);
      if (error) throw error;

      const all = data || [];
      const suggested = all.filter((a: any) => a.activation_status === 'suggested').length;
      const initiated = all.filter((a: any) => a.activation_status === 'initiated').length;
      const completed = all.filter((a: any) => a.activation_status === 'completed').length;
      const dismissed = all.filter((a: any) => a.activation_status === 'dismissed').length;
      const actioned = initiated + completed;

      // Find top trigger type
      const typeCounts: Record<string, number> = {};
      all.forEach((a: any) => {
        const tt = a.compliance_playbooks?.trigger_type || 'unknown';
        typeCounts[tt] = (typeCounts[tt] || 0) + 1;
      });
      const topTriggerType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none';

      return {
        suggested30d: suggested,
        initiated30d: initiated,
        completed30d: completed,
        dismissed30d: dismissed,
        initiationRate: all.length > 0 ? Math.round((actioned / all.length) * 100) : 0,
        completionRate: actioned > 0 ? Math.round((completed / actioned) * 100) : 0,
        topTriggerType,
      } as PlaybookOverview;
    },
  });
}

export function useUpdateActivationStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, stepOrder }: { id: string; status: string; stepOrder?: number }) => {
      const updates: any = { activation_status: status };
      if (status === 'completed') updates.completed_at = new Date().toISOString();
      if (stepOrder !== undefined) updates.current_step_order = stepOrder;

      const { error } = await supabase
        .from('playbook_activations')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playbook-activations'] });
      queryClient.invalidateQueries({ queryKey: ['playbook-overview'] });
    },
  });
}
