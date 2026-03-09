import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import { calculateStatus } from '@/types/scorecard';
import type { ScorecardMetric, ScorecardEntry, MetricStatus } from '@/types/scorecard';

const STALE_MS = 30_000;

// Map the raw DB row to our typed ScorecardMetric
function mapMetric(row: Record<string, unknown>): ScorecardMetric {
  return {
    id: row.id as string,
    scorecard_id: row.scorecard_id as string,
    tenant_id: row.tenant_id as number,
    name: (row.name || row.metric_name) as string,
    description: row.description as string | null,
    category: (row.category as string) || 'Delivery',
    owner_id: row.owner_id as string | null,
    target_value: (row.target_value ?? row.goal_value ?? 0) as number,
    unit: row.unit as string,
    direction: (row.direction as ScorecardMetric['direction']) || 'higher_is_better',
    frequency: (row.frequency as string) || 'weekly',
    metric_source: (row.metric_source as ScorecardMetric['metric_source']) || 'manual',
    metric_key: row.metric_key as string | null,
    example_result: row.example_result as string | null,
    is_active: row.is_active as boolean,
    is_archived: (row.is_archived as boolean) || false,
    display_order: (row.display_order as number) || 0,
    created_by: row.created_by as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function mapEntry(row: Record<string, unknown>): ScorecardEntry {
  return {
    id: row.id as string,
    metric_id: row.metric_id as string,
    tenant_id: row.tenant_id as number,
    week_ending: row.week_ending as string,
    value: (row.value as number),
    actual_value: (row.actual_value ?? row.value) as number,
    notes: row.notes as string | null,
    entered_by: row.entered_by as string,
    entered_at: row.entered_at as string,
    entry_source: ((row.entry_source as string) || 'manual') as ScorecardEntry['entry_source'],
    status: row.status as MetricStatus | null,
    created_by: row.created_by as string | null,
    updated_at: row.updated_at as string | null,
  };
}

export function useScorecardMetrics(showArchived = false) {
  const { profile, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const isSuper = isSuperAdmin();
  const isVivacityTeam = ['Super Admin', 'Team Leader', 'Team Member'].includes(
    profile?.unicorn_role || '',
  );

  const { data: metrics = [], isLoading } = useQuery({
    queryKey: ['scorecard-metrics-v2', profile?.tenant_id, showArchived],
    staleTime: STALE_MS,
    queryFn: async () => {
      let query = supabase
        .from('eos_scorecard_metrics')
        .select('*')
        .order('display_order', { ascending: true });

      if (showArchived) {
        query = query.eq('is_archived', true);
      } else {
        query = query.eq('is_active', true).eq('is_archived', false);
      }

      if (!isSuper && !isVivacityTeam && profile?.tenant_id) {
        query = query.eq('tenant_id', profile.tenant_id);
      }

      const { data, error } = await query;
      if (error) throw error;

      const mapped = (data || []).map(mapMetric);

      // Fetch last 13 weeks of entries for all metrics
      if (mapped.length === 0) return [];
      const ids = mapped.map((m) => m.id);
      const thirteenWeeksAgo = new Date();
      thirteenWeeksAgo.setDate(thirteenWeeksAgo.getDate() - 91);
      const weekCutoff = thirteenWeeksAgo.toISOString().split('T')[0];

      const { data: entries } = await supabase
        .from('eos_scorecard_entries')
        .select('*')
        .in('metric_id', ids)
        .gte('week_ending', weekCutoff)
        .order('week_ending', { ascending: false });

      const mappedEntries = (entries || []).map(mapEntry);
      const entryMap = new Map<string, ScorecardEntry[]>();
      for (const e of mappedEntries) {
        if (!entryMap.has(e.metric_id)) entryMap.set(e.metric_id, []);
        entryMap.get(e.metric_id)!.push(e);
      }

      return mapped.map((m) => {
        const recent = entryMap.get(m.id) || [];
        const latest = recent[0] || null;
        const latestStatus: MetricStatus =
          latest
            ? calculateStatus(
                (latest.actual_value ?? latest.value) as number,
                m.target_value,
                m.direction,
              )
            : 'no_data';
        return { ...m, latestEntry: latest, latestStatus, recentEntries: recent };
      });
    },
    enabled: isSuper || isVivacityTeam || !!profile?.tenant_id,
  });

  const auditLog = async (action: string, entityId: string, details?: Record<string, unknown>) => {
    if (!profile?.tenant_id || !profile?.user_uuid) return;
    await supabase.from('client_audit_log').insert({
      tenant_id: profile.tenant_id,
      actor_user_id: profile.user_uuid,
      action,
      entity_type: 'scorecard_metric',
      entity_id: String(entityId),
      details: (details || {}) as never,
    } as never);
  };

  const createMetric = useMutation({
    mutationFn: async (payload: Partial<ScorecardMetric>) => {
      // Resolve or create default scorecard
      let scorecardId: string;
      const { data: existing } = await supabase
        .from('eos_scorecard')
        .select('id')
        .eq('tenant_id', profile?.tenant_id!)
        .eq('is_active', true)
        .maybeSingle();

      if (existing) {
        scorecardId = existing.id;
      } else {
        const { data: newSc, error: scErr } = await supabase
          .from('eos_scorecard')
          .insert({
            tenant_id: profile?.tenant_id!,
            name: 'Company Scorecard',
            is_active: true,
          })
          .select('id')
          .single();
        if (scErr) throw scErr;
        scorecardId = newSc.id;
      }

      const { data, error } = await supabase
        .from('eos_scorecard_metrics')
        .insert({
          scorecard_id: scorecardId,
          tenant_id: profile?.tenant_id!,
          name: payload.name!,
          metric_name: payload.name!,
          description: payload.description || null,
          category: payload.category || 'Delivery',
          owner_id: payload.owner_id || null,
          target_value: payload.target_value!,
          goal_value: payload.target_value!,
          unit: payload.unit!,
          direction: payload.direction!,
          frequency: payload.frequency || 'weekly',
          metric_source: payload.metric_source || 'manual',
          metric_key: payload.metric_key || null,
          example_result: payload.example_result || null,
          is_active: true,
          is_archived: false,
          display_order: 0,
          created_by: profile?.user_uuid,
        } as never)
        .select()
        .single();
      if (error) throw error;
      await auditLog('scorecard_metric.created', data.id, { name: payload.name });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scorecard-metrics-v2'] });
      queryClient.invalidateQueries({ queryKey: ['eos-scorecard-metrics'] });
      toast({ title: 'Metric created' });
    },
    onError: (e: Error) => toast({ title: 'Error creating metric', description: e.message, variant: 'destructive' }),
  });

  const updateMetric = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ScorecardMetric> & { id: string }) => {
      const { data, error } = await supabase
        .from('eos_scorecard_metrics')
        .update({
          name: updates.name,
          metric_name: updates.name,
          description: updates.description,
          category: updates.category,
          owner_id: updates.owner_id,
          target_value: updates.target_value,
          goal_value: updates.target_value,
          unit: updates.unit,
          direction: updates.direction,
          frequency: updates.frequency,
          metric_source: updates.metric_source,
          metric_key: updates.metric_key,
          example_result: updates.example_result,
          is_active: updates.is_active,
          is_archived: updates.is_archived,
        } as never)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      await auditLog('scorecard_metric.updated', id, { changes: Object.keys(updates) });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scorecard-metrics-v2'] });
      queryClient.invalidateQueries({ queryKey: ['eos-scorecard-metrics'] });
      toast({ title: 'Metric updated' });
    },
    onError: (e: Error) => toast({ title: 'Error updating metric', description: e.message, variant: 'destructive' }),
  });

  const archiveMetric = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('eos_scorecard_metrics')
        .update({ is_archived: true, is_active: false } as never)
        .eq('id', id);
      if (error) throw error;
      await auditLog('scorecard_metric.archived', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scorecard-metrics-v2'] });
      queryClient.invalidateQueries({ queryKey: ['eos-scorecard-metrics'] });
      toast({ title: 'Metric archived' });
    },
    onError: (e: Error) => toast({ title: 'Error archiving metric', description: e.message, variant: 'destructive' }),
  });

  const deleteMetric = useMutation({
    mutationFn: async (id: string) => {
      const { count } = await supabase
        .from('eos_scorecard_entries')
        .select('id', { count: 'exact', head: true })
        .eq('metric_id', id);
      if (count && count > 0) {
        throw new Error('This metric has recorded entries. Archive it instead of deleting.');
      }
      const { error } = await supabase
        .from('eos_scorecard_metrics')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await auditLog('scorecard_metric.deleted', id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scorecard-metrics-v2'] });
      queryClient.invalidateQueries({ queryKey: ['eos-scorecard-metrics'] });
      toast({ title: 'Metric deleted' });
    },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  });

  const recordEntry = useMutation({
    mutationFn: async ({
      metric,
      value,
      notes,
      weekEnding,
    }: {
      metric: ScorecardMetric;
      value: number;
      notes?: string;
      weekEnding: string;
    }) => {
      const status = calculateStatus(value, metric.target_value, metric.direction);

      // Upsert by metric_id + week_ending
      const { data: existing } = await supabase
        .from('eos_scorecard_entries')
        .select('id')
        .eq('metric_id', metric.id)
        .eq('week_ending', weekEnding)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('eos_scorecard_entries')
          .update({
            value,
            actual_value: value,
            notes: notes || null,
            status,
            updated_at: new Date().toISOString(),
          } as never)
          .eq('id', existing.id);
        if (error) throw error;
        await auditLog('scorecard_entry.updated', existing.id, { metric_id: metric.id, value, status });
      } else {
        const { data, error } = await supabase
          .from('eos_scorecard_entries')
          .insert({
            metric_id: metric.id,
            tenant_id: profile?.tenant_id!,
            week_ending: weekEnding,
            value,
            actual_value: value,
            notes: notes || null,
            entered_by: profile?.user_uuid!,
            entry_source: 'manual',
            status,
            created_by: profile?.user_uuid,
          } as never)
          .select()
          .single();
        if (error) throw error;
        await auditLog('scorecard_entry.created', data.id, { metric_id: metric.id, value, status });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scorecard-metrics-v2'] });
      toast({ title: 'Result recorded' });
    },
    onError: (e: Error) => toast({ title: 'Error recording result', description: e.message, variant: 'destructive' }),
  });

  return {
    metrics,
    isLoading,
    createMetric,
    updateMetric,
    archiveMetric,
    deleteMetric,
    recordEntry,
  };
}
