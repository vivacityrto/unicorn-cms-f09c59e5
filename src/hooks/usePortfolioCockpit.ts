import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

// ── Types ──────────────────────────────────────────────────────
export interface PortfolioTenant {
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
}

export interface TenantComms {
  tenant_id: number;
  recent_notes_json: any[];
  recent_emails_json: any[];
}

export type SavedView = 'my_tenants' | 'all_tenants';

export interface PortfolioFilters {
  search: string;
  riskStatus: string | null;
  stageHealth: string | null;
  mandatoryGapsOnly: boolean;
  burnRiskOnly: boolean;
  renewalDays: number | null;
}

const SEVERITY_RANK: Record<string, number> = { critical: 3, high: 2, moderate: 1 };

// ── Hook ───────────────────────────────────────────────────────
export function usePortfolioCockpit() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isVivacityStaff = ['Super Admin', 'Team Leader', 'Team Member'].includes(profile?.unicorn_role || '');
  const isExec = ['Super Admin'].includes(profile?.unicorn_role || '');
  const canSeeAll = isExec; // SuperAdmin / Integrator / CEO
  const isTeamLeader = profile?.unicorn_role === 'Team Leader';

  const [savedView, setSavedView] = useState<SavedView>('my_tenants');
  const [filters, setFilters] = useState<PortfolioFilters>({
    search: '',
    riskStatus: null,
    stageHealth: null,
    mandatoryGapsOnly: false,
    burnRiskOnly: false,
    renewalDays: null,
  });

  // ── Portfolio data ──
  const { data: rawPortfolio = [], isLoading: portfolioLoading } = useQuery({
    queryKey: ['portfolio-cockpit-tenants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_dashboard_tenant_portfolio' as any)
        .select('*');
      if (error) throw error;
      return (data || []) as unknown as PortfolioTenant[];
    },
    enabled: isVivacityStaff,
    staleTime: 60_000,
  });

  // ── CSC user names lookup ──
  const cscIds = useMemo(() => {
    const ids = new Set<string>();
    rawPortfolio.forEach(t => { if (t.assigned_csc_user_id) ids.add(t.assigned_csc_user_id); });
    return Array.from(ids);
  }, [rawPortfolio]);

  const { data: cscUsers = [] } = useQuery({
    queryKey: ['portfolio-csc-users', cscIds],
    queryFn: async () => {
      if (cscIds.length === 0) return [];
      const { data } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name')
        .in('user_uuid', cscIds);
      return data || [];
    },
    enabled: cscIds.length > 0,
  });

  const cscNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    cscUsers.forEach((u: any) => {
      map[u.user_uuid] = `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Unknown';
    });
    return map;
  }, [cscUsers]);

  // ── Filter portfolio ──
  const portfolio = useMemo(() => {
    let list = rawPortfolio;

    // View filter
    if (savedView === 'my_tenants' && profile?.user_uuid) {
      list = list.filter(t => t.assigned_csc_user_id === profile.user_uuid);
    }

    // Search
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

    return list;
  }, [rawPortfolio, savedView, filters, profile?.user_uuid]);

  // ── KPI tiles ──
  const kpis = useMemo(() => ({
    totalTenants: portfolio.length,
    highRisk: portfolio.filter(t => ['high', 'elevated'].includes(t.risk_status)).length,
    criticalStages: portfolio.reduce((s, t) => s + t.critical_stage_count, 0),
    mandatoryGaps: portfolio.reduce((s, t) => s + t.mandatory_gaps_count, 0),
    burnCritical: portfolio.filter(t => t.burn_risk_status === 'critical').length,
    retentionHighRisk: portfolio.filter(t => ['high_risk', 'vulnerable'].includes(t.retention_status)).length,
  }), [portfolio]);

  // ── Priority Inbox ──
  const { data: rawInbox = [], isLoading: inboxLoading } = useQuery({
    queryKey: ['portfolio-cockpit-inbox'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_dashboard_priority_inbox' as any)
        .select('*');
      if (error) throw error;
      return (data || []) as unknown as PriorityInboxItem[];
    },
    enabled: isVivacityStaff,
    staleTime: 60_000,
  });

  // Filter snoozed items
  const { data: inboxActions = [] } = useQuery({
    queryKey: ['portfolio-inbox-actions'],
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
    const snoozedIds = new Set(
      inboxActions
        .filter((a: any) => a.action_type === 'snooze' && (!a.until_at || new Date(a.until_at) > now))
        .map((a: any) => a.item_id)
    );
    const ackedIds = new Set(
      inboxActions.filter((a: any) => a.action_type === 'acknowledge').map((a: any) => a.item_id)
    );

    let items = rawInbox.filter(i => !snoozedIds.has(i.item_id) && !ackedIds.has(i.item_id));

    // Filter by assigned tenants for CSCs
    if (savedView === 'my_tenants' && profile?.user_uuid) {
      const myTenantIds = new Set(rawPortfolio.filter(t => t.assigned_csc_user_id === profile.user_uuid).map(t => t.tenant_id));
      items = items.filter(i => !i.tenant_id || myTenantIds.has(i.tenant_id));
    }

    // Sort: severity desc, then oldest first
    return items.sort((a, b) => {
      const sr = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);
      if (sr !== 0) return sr;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [rawInbox, inboxActions, savedView, rawPortfolio, profile?.user_uuid]);

  // ── Inbox actions ──
  const acknowledgeItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await (supabase.from as any)('priority_inbox_actions').insert({
        item_id: itemId,
        item_type: 'inbox',
        user_id: profile!.user_uuid,
        action_type: 'acknowledge',
      });
      if (error) throw error;
      await (supabase.from as any)('audit_dashboard_events').insert({
        actor_user_id: profile!.user_uuid,
        action: 'inbox_acknowledge',
        metadata_json: { item_id: itemId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio-inbox-actions'] });
      toast({ title: 'Acknowledged' });
    },
  });

  const snoozeItem = useMutation({
    mutationFn: async ({ itemId, days }: { itemId: string; days: number }) => {
      const until = new Date();
      until.setDate(until.getDate() + days);
      const { error } = await (supabase.from as any)('priority_inbox_actions').insert({
        item_id: itemId,
        item_type: 'inbox',
        user_id: profile!.user_uuid,
        action_type: 'snooze',
        until_at: until.toISOString(),
      });
      if (error) throw error;
      await (supabase.from as any)('audit_dashboard_events').insert({
        actor_user_id: profile!.user_uuid,
        action: 'inbox_snooze',
        metadata_json: { item_id: itemId, days },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portfolio-inbox-actions'] });
      toast({ title: 'Snoozed' });
    },
  });

  // ── Tenant comms (for drawer) ──
  const fetchTenantComms = useCallback(async (tenantId: number): Promise<TenantComms | null> => {
    const { data, error } = await supabase
      .from('v_dashboard_tenant_recent_comms' as any)
      .select('*')
      .eq('tenant_id', tenantId)
      .single();
    if (error) return null;
    return data as unknown as TenantComms;
  }, []);

  // ── Audit helper ──
  const logDashboardEvent = useCallback(async (action: string, metadata: Record<string, any> = {}) => {
    if (!profile?.user_uuid) return;
    await (supabase.from as any)('audit_dashboard_events').insert({
      actor_user_id: profile.user_uuid,
      action,
      metadata_json: { ...metadata, saved_view: savedView },
    });
  }, [profile?.user_uuid, savedView]);

  return {
    // State
    portfolio,
    portfolioLoading,
    priorityInbox,
    inboxLoading,
    kpis,
    filters,
    setFilters,
    savedView,
    setSavedView,
    canSeeAll,
    isExec,
    isTeamLeader,
    isVivacityStaff,
    cscNameMap,
    // Actions
    acknowledgeItem: acknowledgeItem.mutate,
    snoozeItem: snoozeItem.mutate,
    fetchTenantComms,
    logDashboardEvent,
    profile,
  };
}
