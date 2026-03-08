import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

// ── Types ──────────────────────────────────────────────────────

export interface AttentionTenant {
  tenant_id: number;
  tenant_name: string;
  tenant_status: string;
  abn: string | null;
  rto_id: string | null;
  cricos_id: string | null;
  assigned_csc_user_id: string | null;
  packages_json: any[];
  risk_status: string;
  risk_index: number;
  risk_index_delta_14d: number;
  worst_stage_health_status: string;
  critical_stage_count: number;
  at_risk_stage_count: number;
  open_tasks_count: number;
  overdue_tasks_count: number;
  mandatory_gaps_count: number;
  consult_hours_30d: number;
  burn_risk_status: string;
  projected_exhaustion_date: string | null;
  retention_status: string;
  composite_retention_risk_index: number | null;
  last_activity_at: string | null;
  renewal_window_start: string | null;
  high_severity_open_risks: number;
  days_since_activity: number;
  days_to_renewal: number | null;
  stage_score: number;
  gaps_score: number;
  risk_score: number;
  staleness_score: number;
  renewal_score: number;
  burn_score: number;
  task_score: number;
  compliance_overdue_tasks: number;
  compliance_blocked_tasks: number;
  compliance_open_tasks: number;
  attention_score: number;
  attention_drivers_json: any[];
}

export interface PriorityInboxItem {
  item_id: string;
  item_type: string;
  severity: string;
  tenant_id: number | null;
  stage_instance_id: string | null;
  standard_clause: string | null;
  summary: string;
  owner_user_id: string | null;
  created_at: string;
  why_text?: string;
}

export interface RiskCluster {
  standard_clause: string;
  tenant_count: number;
  total_events: number;
  trend: string;
  has_regulator_overlap: boolean;
}

export interface LabourMetric {
  csc_user_id: string;
  csc_name: string;
  client_count: number;
  weekly_capacity_hours: number;
  total_overdue_tasks: number;
  total_open_tasks: number;
  overdue_ratio_pct: number;
  intensive_clients: number;
  low_touch_clients: number;
}

export interface TenantComms {
  tenant_id: number;
  recent_notes_json: any[];
  recent_emails_json: any[];
}

export type SavedView = 'my_tenants' | 'all_tenants';

export interface TriageFilters {
  search: string;
  riskStatus: string | null;
  stageHealth: string | null;
  mandatoryGapsOnly: boolean;
  burnRiskOnly: boolean;
}

export interface FocusItem {
  id: string;
  severity: 'critical' | 'high' | 'moderate';
  tenantName: string;
  tenantId: number;
  reason: string;
  age: string;
  ageMs: number;
  actionLabel: string;
  actionType: string;
  whyText?: string;
  /** Route to navigate to when actioned (optional override) */
  actionRoute?: string;
}

const SEVERITY_RANK: Record<string, number> = { critical: 3, high: 2, moderate: 1 };

// ── Hook ───────────────────────────────────────────────────────
export function useDashboardTriage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isVivacityStaff = ['Super Admin', 'Team Leader', 'Team Member'].includes(profile?.unicorn_role || '');
  const isSuperAdmin = profile?.unicorn_role === 'Super Admin';
  const isExec = isSuperAdmin || profile?.unicorn_role === 'Team Leader';
  const canSeeAll = isSuperAdmin;

  const [savedView, setSavedView] = useState<SavedView>('my_tenants');
  const [filters, setFilters] = useState<TriageFilters>({
    search: '',
    riskStatus: null,
    stageHealth: null,
    mandatoryGapsOnly: false,
    burnRiskOnly: false,
  });

  // ── Outstanding action items for Today's Focus ──
  const { data: outstandingActions = [] } = useQuery({
    queryKey: ['triage-outstanding-actions', profile?.user_uuid],
    queryFn: async () => {
      // Fetch overdue or high/urgent priority open items from ops_work_items
      const { data: opsItems, error: opsErr } = await supabase
        .from('ops_work_items')
        .select('id, title, priority, status, due_at, tenant_id, owner_user_uuid')
        .in('status', ['open', 'in_progress', 'blocked'])
        .order('due_at', { ascending: true, nullsFirst: false });
      if (opsErr) throw opsErr;

      // Fetch overdue or high/urgent from client_action_items
      const { data: clientItems, error: clientErr } = await supabase
        .from('client_action_items')
        .select('id, title, priority, status, due_date, tenant_id')
        .in('status', ['open', 'in_progress', 'blocked'])
        .order('due_date', { ascending: true, nullsFirst: false });
      if (clientErr) throw clientErr;

      const now = new Date();
      const combined: Array<{
        id: string; title: string; priority: string; status: string;
        due: string | null; tenant_id: number | null; source: 'ops' | 'client';
        is_overdue: boolean; is_high_priority: boolean;
      }> = [];

      (opsItems || []).forEach((i: any) => {
        const isOverdue = i.due_at ? new Date(i.due_at) < now : false;
        const isHighPriority = ['high', 'urgent'].includes(i.priority || '');
        if (isOverdue || isHighPriority) {
          combined.push({
            id: i.id, title: i.title, priority: i.priority || 'medium',
            status: i.status, due: i.due_at, tenant_id: i.tenant_id,
            source: 'ops', is_overdue: isOverdue, is_high_priority: isHighPriority,
          });
        }
      });

      (clientItems || []).forEach((i: any) => {
        const isOverdue = i.due_date ? new Date(i.due_date) < now : false;
        const isHighPriority = ['high', 'urgent'].includes(i.priority || '');
        if (isOverdue || isHighPriority) {
          combined.push({
            id: i.id, title: i.title, priority: i.priority || 'medium',
            status: i.status, due: i.due_date, tenant_id: i.tenant_id,
            source: 'client', is_overdue: isOverdue, is_high_priority: isHighPriority,
          });
        }
      });

      // Sort: overdue first, then by priority
      const prioRank: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
      combined.sort((a, b) => {
        if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
        return (prioRank[b.priority] || 0) - (prioRank[a.priority] || 0);
      });

      return combined;
    },
    enabled: isVivacityStaff,
    staleTime: 60_000,
  });

  // ── Attention-ranked tenants ──
  const { data: rawTenants = [], isLoading: tenantsLoading } = useQuery({
    queryKey: ['triage-attention-ranked'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_dashboard_attention_ranked' as any)
        .select('*');
      if (error) throw error;
      return (data || []) as unknown as AttentionTenant[];
    },
    enabled: isVivacityStaff,
    staleTime: 60_000,
  });

  // ── CSC name map ──
  const cscIds = useMemo(() => {
    const ids = new Set<string>();
    rawTenants.forEach(t => { if (t.assigned_csc_user_id) ids.add(t.assigned_csc_user_id); });
    return Array.from(ids);
  }, [rawTenants]);

  const { data: cscUsers = [] } = useQuery({
    queryKey: ['triage-csc-users', cscIds],
    queryFn: async () => {
      if (cscIds.length === 0) return [];
      const { data } = await supabase.from('users').select('user_uuid, first_name, last_name').in('user_uuid', cscIds);
      return data || [];
    },
    enabled: cscIds.length > 0,
  });

  const cscNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    cscUsers.forEach((u: any) => { map[u.user_uuid] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Unknown'; });
    return map;
  }, [cscUsers]);

  // ── Apply view + filters ──
  const filteredTenants = useMemo(() => {
    let list = rawTenants;
    if (savedView === 'my_tenants' && profile?.user_uuid) {
      list = list.filter(t => t.assigned_csc_user_id === profile.user_uuid);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(t =>
        t.tenant_name?.toLowerCase().includes(q) ||
        t.abn?.toLowerCase().includes(q) ||
        t.rto_id?.toLowerCase().includes(q) ||
        t.cricos_id?.toLowerCase().includes(q)
      );
    }
    if (filters.riskStatus) list = list.filter(t => t.risk_status === filters.riskStatus);
    if (filters.stageHealth) list = list.filter(t => t.worst_stage_health_status === filters.stageHealth);
    if (filters.mandatoryGapsOnly) list = list.filter(t => t.mandatory_gaps_count > 0);
    if (filters.burnRiskOnly) list = list.filter(t => t.burn_risk_status === 'critical');
    return list; // already sorted by attention_score DESC from view
  }, [rawTenants, savedView, filters, profile?.user_uuid]);

  // ── Split into attention (top 5) and low-attention ──
  const top5 = useMemo(() => filteredTenants.slice(0, 5), [filteredTenants]);
  const lowAttention = useMemo(() =>
    filteredTenants.filter(t =>
      t.risk_status === 'stable' &&
      t.worst_stage_health_status === 'healthy' &&
      t.mandatory_gaps_count === 0 &&
      !['high_risk', 'vulnerable'].includes(t.retention_status) &&
      t.burn_risk_status !== 'critical'
    ), [filteredTenants]);
  const activePortfolio = useMemo(() =>
    filteredTenants.filter(t => !lowAttention.includes(t)),
    [filteredTenants, lowAttention]);

  // ── Today's Focus: auto-generate 3-5 items ──
  const todaysFocus = useMemo((): FocusItem[] => {
    const items: FocusItem[] = [];
    const now = Date.now();
    const tenants = savedView === 'my_tenants' && profile?.user_uuid
      ? rawTenants.filter(t => t.assigned_csc_user_id === profile.user_uuid)
      : rawTenants;

    // Critical stages
    tenants.filter(t => t.worst_stage_health_status === 'critical').slice(0, 2).forEach(t => {
      items.push({
        id: `focus-stage-${t.tenant_id}`,
        severity: 'critical',
        tenantName: t.tenant_name,
        tenantId: t.tenant_id,
        reason: `Stage stalled${t.days_since_activity ? ` ${t.days_since_activity} days` : ''}`,
        age: t.days_since_activity ? `${t.days_since_activity}d` : '',
        ageMs: (t.days_since_activity || 0) * 86400000,
        actionLabel: 'Review Stage',
        actionType: 'review_stage',
        whyText: `${t.critical_stage_count} critical stage(s). Stage health score: ${t.stage_score}/100 (weight 30%). Attention score: ${t.attention_score}.`,
      });
    });

    // High severity risk
    tenants.filter(t => t.risk_status === 'high' && !items.some(i => i.tenantId === t.tenant_id)).slice(0, 1).forEach(t => {
      items.push({
        id: `focus-risk-${t.tenant_id}`,
        severity: 'critical',
        tenantName: t.tenant_name,
        tenantId: t.tenant_id,
        reason: `High risk – index ${t.risk_index}`,
        age: '',
        ageMs: 0,
        actionLabel: 'Review Risk',
        actionType: 'review_risk',
        whyText: `Risk index ${t.risk_index} with ${t.high_severity_open_risks} high-severity open risks. Delta: ${t.risk_index_delta_14d > 0 ? '+' : ''}${t.risk_index_delta_14d} over 14d. Risk score: ${t.risk_score}/100 (weight 20%).`,
      });
    });

    // Mandatory gaps > 14 days
    tenants.filter(t => t.mandatory_gaps_count > 0 && t.days_since_activity > 14 && !items.some(i => i.tenantId === t.tenant_id)).slice(0, 1).forEach(t => {
      items.push({
        id: `focus-gap-${t.tenant_id}`,
        severity: 'high',
        tenantName: t.tenant_name,
        tenantId: t.tenant_id,
        reason: `${t.mandatory_gaps_count} mandatory evidence gaps open`,
        age: `${t.days_since_activity}d inactive`,
        ageMs: t.days_since_activity * 86400000,
        actionLabel: 'Check Gaps',
        actionType: 'check_gaps',
        whyText: `${t.mandatory_gaps_count} mandatory evidence categories missing. Gaps score: ${t.gaps_score}/100 (weight 20%). Inactive for ${t.days_since_activity} days.`,
      });
    });

    // Burn risk critical
    tenants.filter(t => t.burn_risk_status === 'critical' && !items.some(i => i.tenantId === t.tenant_id)).slice(0, 1).forEach(t => {
      items.push({
        id: `focus-burn-${t.tenant_id}`,
        severity: 'high',
        tenantName: t.tenant_name,
        tenantId: t.tenant_id,
        reason: `Hours exhaustion: ${t.projected_exhaustion_date || 'imminent'}`,
        age: '',
        ageMs: 0,
        actionLabel: 'Review Hours',
        actionType: 'review_burn',
        whyText: `Burn status critical. Projected exhaustion: ${t.projected_exhaustion_date || 'unknown'}. Burn score: ${t.burn_score}/100 (weight 5%).`,
      });
    });

    // Retention high risk
    tenants.filter(t => t.retention_status === 'high_risk' && !items.some(i => i.tenantId === t.tenant_id)).slice(0, 1).forEach(t => {
      items.push({
        id: `focus-retention-${t.tenant_id}`,
        severity: 'high',
        tenantName: t.tenant_name,
        tenantId: t.tenant_id,
        reason: 'Retention at high risk',
        age: '',
        ageMs: 0,
        actionLabel: 'Review Retention',
        actionType: 'review_retention',
        whyText: `Retention status: high_risk. Renewal score: ${t.renewal_score}/100 (weight 10%).${t.days_to_renewal != null ? ` ${t.days_to_renewal}d to renewal.` : ''}`,
      });
    });

    // Overdue compliance escalation (>= 5 overdue compliance tasks) — always pinned
    tenants.filter(t => (t.compliance_overdue_tasks ?? 0) >= 5 && !items.some(i => i.tenantId === t.tenant_id)).slice(0, 2).forEach(t => {
      items.push({
        id: `focus-compliance-${t.tenant_id}`,
        severity: 'critical',
        tenantName: t.tenant_name,
        tenantId: t.tenant_id,
        reason: `${t.compliance_overdue_tasks} overdue compliance tasks`,
        age: '',
        ageMs: 0,
        actionLabel: 'Triage Now',
        actionType: 'triage_compliance',
        whyText: `${t.compliance_overdue_tasks} overdue compliance tasks. Task score: ${t.task_score}/100 (weight 15%). Escalation threshold: 5+.`,
      });
    });

    // No activity > 21 days
    tenants.filter(t => t.days_since_activity > 21 && !items.some(i => i.tenantId === t.tenant_id)).slice(0, 1).forEach(t => {
      items.push({
        id: `focus-inactive-${t.tenant_id}`,
        severity: 'moderate',
        tenantName: t.tenant_name,
        tenantId: t.tenant_id,
        reason: `No activity for ${t.days_since_activity} days`,
        age: `${t.days_since_activity}d`,
        ageMs: t.days_since_activity * 86400000,
        actionLabel: 'Check In',
        actionType: 'check_in',
        whyText: `No task updates, uploads, or notes for ${t.days_since_activity} days. Staleness score: ${t.staleness_score}/100 (weight 15%).${t.open_tasks_count > 0 ? ` ${t.open_tasks_count} open tasks pending.` : ''}`,
      });
    });

    // ── Outstanding action items (overdue / high-priority) ──
    const tenantNameMap: Record<number, string> = {};
    tenants.forEach(t => { tenantNameMap[t.tenant_id] = t.tenant_name; });

    const overdueCount = outstandingActions.filter(a => a.is_overdue).length;
    const highPrioCount = outstandingActions.filter(a => a.is_high_priority && !a.is_overdue).length;

    if (overdueCount > 0) {
      items.push({
        id: 'focus-overdue-actions',
        severity: 'critical',
        tenantName: 'Action Items',
        tenantId: 0,
        reason: `${overdueCount} overdue action item${overdueCount === 1 ? '' : 's'} need attention`,
        age: '',
        ageMs: 0,
        actionLabel: 'View Actions',
        actionType: 'view_actions',
        actionRoute: '/my-work',
        whyText: `You have ${overdueCount} overdue action item${overdueCount === 1 ? '' : 's'} across your portfolio. These are past their due date and need immediate resolution.`,
      });
    }

    if (highPrioCount > 0 && items.length < 5) {
      items.push({
        id: 'focus-high-prio-actions',
        severity: 'high',
        tenantName: 'Action Items',
        tenantId: 0,
        reason: `${highPrioCount} high/urgent priority action item${highPrioCount === 1 ? '' : 's'}`,
        age: '',
        ageMs: 0,
        actionLabel: 'View Actions',
        actionType: 'view_actions',
        actionRoute: '/tasks',
        whyText: `${highPrioCount} action item${highPrioCount === 1 ? '' : 's'} marked as high or urgent priority requiring prompt action.`,
      });
    }

    // If still empty, inject proactive items
    if (items.length === 0) {
      const sorted = [...tenants].sort((a, b) => b.attention_score - a.attention_score);
      sorted.slice(0, 3).forEach(t => {
        const topDriver = Array.isArray(t.attention_drivers_json) && t.attention_drivers_json[0];
        items.push({
          id: `focus-proactive-${t.tenant_id}`,
          severity: 'moderate',
          tenantName: t.tenant_name,
          tenantId: t.tenant_id,
          reason: 'Proactive review required',
          age: t.days_since_activity ? `${t.days_since_activity}d since activity` : '',
          ageMs: (t.days_since_activity || 0) * 86400000,
          actionLabel: 'Review',
          actionType: 'proactive_review',
          whyText: topDriver ? `Top driver: ${topDriver.driver} (${topDriver.value}). Attention score: ${t.attention_score}.` : `Attention score: ${t.attention_score}. No critical signals but due for review.`,
        });
      });
    }

    return items.slice(0, 7);
  }, [rawTenants, savedView, profile?.user_uuid, outstandingActions]);

  // ── KPIs ──
  const kpis = useMemo(() => ({
    highRisk: filteredTenants.filter(t => ['high', 'elevated'].includes(t.risk_status)).length,
    criticalStages: filteredTenants.reduce((s, t) => s + t.critical_stage_count, 0),
    mandatoryGaps: filteredTenants.reduce((s, t) => s + t.mandatory_gaps_count, 0),
    burnCritical: filteredTenants.filter(t => t.burn_risk_status === 'critical').length,
    retentionHighRisk: filteredTenants.filter(t => ['high_risk', 'vulnerable'].includes(t.retention_status)).length,
  }), [filteredTenants]);

  // ── Priority Inbox ──
  const { data: rawInbox = [], isLoading: inboxLoading } = useQuery({
    queryKey: ['triage-priority-inbox'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_dashboard_priority_inbox' as any).select('*');
      if (error) throw error;
      return (data || []) as unknown as PriorityInboxItem[];
    },
    enabled: isVivacityStaff,
    staleTime: 60_000,
  });

  const { data: inboxActions = [] } = useQuery({
    queryKey: ['triage-inbox-actions'],
    queryFn: async () => {
      const { data } = await (supabase.from as any)('priority_inbox_actions')
        .select('item_id, action_type, until_at')
        .eq('user_id', profile?.user_uuid || '');
      return data || [];
    },
    enabled: !!profile?.user_uuid,
  });

  const priorityInbox = useMemo(() => {
    const now = new Date();
    const snoozed = new Set(inboxActions.filter((a: any) => a.action_type === 'snooze' && (!a.until_at || new Date(a.until_at) > now)).map((a: any) => a.item_id));
    const acked = new Set(inboxActions.filter((a: any) => a.action_type === 'acknowledge').map((a: any) => a.item_id));
    let items = rawInbox.filter(i => !snoozed.has(i.item_id) && !acked.has(i.item_id));

    if (savedView === 'my_tenants' && profile?.user_uuid) {
      const myIds = new Set(rawTenants.filter(t => t.assigned_csc_user_id === profile.user_uuid).map(t => t.tenant_id));
      items = items.filter(i => !i.tenant_id || myIds.has(i.tenant_id));
    }

    return items.sort((a, b) => {
      const sr = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);
      if (sr !== 0) return sr;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [rawInbox, inboxActions, savedView, rawTenants, profile?.user_uuid]);

  // ── Backend-backed behavioural prompts ──
  const { data: backendPrompts = [] } = useQuery({
    queryKey: ['triage-behavioural-prompts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_dashboard_behavioural_prompts' as any)
        .select('*');
      if (error) throw error;
      return (data || []) as unknown as PriorityInboxItem[];
    },
    enabled: isVivacityStaff,
    staleTime: 120_000,
  });

  // ── Inbox never empty: use backend prompts as fallback ──
  const inboxWithFallbacks = useMemo(() => {
    if (priorityInbox.length > 0) return priorityInbox;

    let prompts = backendPrompts;
    if (savedView === 'my_tenants' && profile?.user_uuid) {
      prompts = prompts.filter((p: any) => p.owner_user_id === profile.user_uuid || !p.owner_user_id);
    }

    // Filter out snoozed/acknowledged prompts
    const now = new Date();
    const snoozed = new Set(inboxActions.filter((a: any) => a.action_type === 'snooze' && (!a.until_at || new Date(a.until_at) > now)).map((a: any) => a.item_id));
    const acked = new Set(inboxActions.filter((a: any) => a.action_type === 'acknowledge').map((a: any) => a.item_id));
    prompts = prompts.filter((p: any) => !snoozed.has(p.item_id) && !acked.has(p.item_id));

    if (prompts.length === 0) {
      return [{
        item_id: 'fallback-review',
        item_type: 'behavioural_prompt',
        severity: 'moderate',
        tenant_id: null,
        stage_instance_id: null,
        standard_clause: null,
        summary: 'Run evidence gap checks on your oldest tenants',
        owner_user_id: null,
        created_at: new Date().toISOString(),
        why_text: 'No active inbox items. Proactive gap checks prevent future CSC rework.',
      } as PriorityInboxItem];
    }

    return prompts.slice(0, 10);
  }, [priorityInbox, backendPrompts, inboxActions, savedView, profile?.user_uuid]);

  // ── Risk clusters ──
  const { data: riskClusters = [] } = useQuery({
    queryKey: ['triage-risk-clusters'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_dashboard_risk_clusters' as any).select('*');
      if (error) throw error;
      return (data || []) as unknown as RiskCluster[];
    },
    enabled: isVivacityStaff,
    staleTime: 300_000,
  });

  // ── Labour efficiency ──
  const { data: labourMetrics = [] } = useQuery({
    queryKey: ['triage-labour-efficiency'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_dashboard_labour_efficiency' as any).select('*');
      if (error) throw error;
      return (data || []) as unknown as LabourMetric[];
    },
    enabled: isExec,
    staleTime: 300_000,
  });

  // Current user's labour metric
  const myLabour = useMemo(() =>
    labourMetrics.find(l => l.csc_user_id === profile?.user_uuid) || null,
    [labourMetrics, profile?.user_uuid]);

  // Overload detection (>110%)
  const isOverloaded = useMemo(() => {
    if (!myLabour) return false;
    if (myLabour.weekly_capacity_hours === 0) return false;
    // We don't have current_load_hours in the simplified view, so check intensive ratio
    return myLabour.intensive_clients > myLabour.low_touch_clients * 2;
  }, [myLabour]);

  // ── Mutations ──
  const acknowledgeItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await (supabase.from as any)('priority_inbox_actions').insert({
        item_id: itemId, item_type: 'inbox', user_id: profile!.user_uuid, action_type: 'acknowledge',
      });
      if (error) throw error;
      await logDashboardEvent('inbox_acknowledge', { item_id: itemId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['triage-inbox-actions'] });
      toast({ title: 'Acknowledged' });
    },
  });

  const snoozeItem = useMutation({
    mutationFn: async ({ itemId, days }: { itemId: string; days: number }) => {
      const until = new Date();
      until.setDate(until.getDate() + days);
      const { error } = await (supabase.from as any)('priority_inbox_actions').insert({
        item_id: itemId, item_type: 'inbox', user_id: profile!.user_uuid, action_type: 'snooze', until_at: until.toISOString(),
      });
      if (error) throw error;
      await logDashboardEvent('inbox_snooze', { item_id: itemId, days });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['triage-inbox-actions'] });
      toast({ title: 'Snoozed' });
    },
  });

  // ── Tenant comms ──
  const fetchTenantComms = useCallback(async (tenantId: number): Promise<TenantComms | null> => {
    const { data, error } = await supabase.from('v_dashboard_tenant_recent_comms' as any).select('*').eq('tenant_id', tenantId).single();
    if (error) return null;
    return data as unknown as TenantComms;
  }, []);

  // ── Audit ──
  const logDashboardEvent = useCallback(async (action: string, metadata: Record<string, any> = {}) => {
    if (!profile?.user_uuid) return;
    await (supabase.from as any)('audit_dashboard_events').insert({
      actor_user_id: profile.user_uuid, action, metadata_json: { ...metadata, saved_view: savedView },
    });
  }, [profile?.user_uuid, savedView]);

  // ── Tenant name map ──
  const tenantNames = useMemo(() => {
    const map: Record<number, string> = {};
    rawTenants.forEach(t => { map[t.tenant_id] = t.tenant_name; });
    return map;
  }, [rawTenants]);

  return {
    // Data
    todaysFocus,
    top5,
    activePortfolio,
    lowAttention,
    filteredTenants,
    tenantsLoading,
    priorityInbox: inboxWithFallbacks,
    inboxLoading,
    riskClusters,
    labourMetrics,
    myLabour,
    isOverloaded,
    kpis,
    tenantNames,
    cscNameMap,
    // State
    filters, setFilters,
    savedView, setSavedView,
    // Permissions
    canSeeAll, isExec, isSuperAdmin, isVivacityStaff,
    // Actions
    acknowledgeItem: acknowledgeItem.mutate,
    snoozeItem: snoozeItem.mutate,
    fetchTenantComms,
    logDashboardEvent,
    profile,
  };
}
