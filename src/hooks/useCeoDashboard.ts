/**
 * useCeoDashboard – Unicorn 2.0
 * Hooks for CEO Executive Dashboard panels.
 * All queries scoped to system tenant (6372) for EOS data.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const SYSTEM_TENANT_ID = 6372;

// ─── A. Traction Status (Rocks) ───
export interface RockStats {
  total: number;
  on_track: number;
  at_risk: number;
  off_track: number;
  not_started: number;
  complete: number;
}

export function useRockStats(quarterYear?: number, quarterNumber?: number) {
  return useQuery({
    queryKey: ['ceo-rock-stats', quarterYear, quarterNumber],
    queryFn: async () => {
      let query = supabase
        .from('eos_rocks')
        .select('status')
        .eq('tenant_id', SYSTEM_TENANT_ID)
        .is('archived_at', null);

      if (quarterYear) query = query.eq('quarter_year', quarterYear);
      if (quarterNumber) query = query.eq('quarter_number', quarterNumber);

      const { data, error } = await query;
      if (error) throw error;

      const rows = data ?? [];
      const stats: RockStats = {
        total: rows.length,
        on_track: rows.filter(r => r.status === 'On_Track').length,
        at_risk: rows.filter(r => r.status === 'At_Risk').length,
        off_track: rows.filter(r => r.status === 'Off_Track').length,
        not_started: rows.filter(r => r.status === 'Not_Started').length,
        complete: rows.filter(r => r.status === 'Complete').length,
      };
      return stats;
    },
    staleTime: 60_000,
  });
}

// ─── B. EOS Discipline (Todos) ───
export interface TodoStats {
  totalThisWeek: number;
  completedThisWeek: number;
  completionRate: number;
  rollingAvg4w: number;
}

export function useTodoStats() {
  return useQuery({
    queryKey: ['ceo-todo-stats'],
    queryFn: async () => {
      // Get todos from last 28 days for 4-week rolling
      const fourWeeksAgo = new Date();
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const { data, error } = await supabase
        .from('eos_todos')
        .select('status, due_date, completed_at, created_at')
        .eq('tenant_id', SYSTEM_TENANT_ID)
        .gte('created_at', fourWeeksAgo.toISOString());

      if (error) throw error;
      const rows = data ?? [];

      // This week
      const thisWeek = rows.filter(r => new Date(r.created_at) >= oneWeekAgo);
      const completedThisWeek = thisWeek.filter(r => r.status === 'Complete').length;
      const totalThisWeek = thisWeek.length;
      const completionRate = totalThisWeek > 0 ? Math.round((completedThisWeek / totalThisWeek) * 100) : 0;

      // 4-week rolling
      const totalAll = rows.length;
      const completedAll = rows.filter(r => r.status === 'Complete').length;
      const rollingAvg4w = totalAll > 0 ? Math.round((completedAll / totalAll) * 100) : 0;

      return { totalThisWeek, completedThisWeek, completionRate, rollingAvg4w } as TodoStats;
    },
    staleTime: 60_000,
  });
}

// ─── C. CEO Relief Index ───
export interface CeoReliefStats {
  totalTodos: number;
  ceoOwnedTodos: number;
  delegatedTodos: number;
  delegationPct: number;
  overdueCount: number;
}

export function useCeoReliefIndex(ceoUserId?: string) {
  return useQuery({
    queryKey: ['ceo-relief-index', ceoUserId],
    queryFn: async () => {
      if (!ceoUserId) return null;

      const { data, error } = await supabase
        .from('eos_todos')
        .select('owner_id, assigned_to, status, due_date')
        .eq('tenant_id', SYSTEM_TENANT_ID)
        .eq('status', 'Open');

      if (error) throw error;
      const rows = data ?? [];

      const totalTodos = rows.length;
      const ceoOwnedTodos = rows.filter(r => r.owner_id === ceoUserId || r.assigned_to === ceoUserId).length;
      const delegatedTodos = totalTodos - ceoOwnedTodos;
      const delegationPct = totalTodos > 0 ? Math.round((delegatedTodos / totalTodos) * 100) : 0;

      const today = new Date().toISOString().split('T')[0];
      const overdueCount = rows.filter(r => r.due_date && r.due_date < today).length;

      return { totalTodos, ceoOwnedTodos, delegatedTodos, delegationPct, overdueCount } as CeoReliefStats;
    },
    enabled: !!ceoUserId,
    staleTime: 60_000,
  });
}

// ─── D. Unicorn Integrity ───
export interface IntegrityStats {
  overdueTaskCount: number;
  overdue7dCount: number;
  recentAuditEvents: number;
}

export function useUnicornIntegrity() {
  return useQuery({
    queryKey: ['ceo-unicorn-integrity'],
    queryFn: async () => {
      const today = new Date();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(today.getDate() - 7);

      // Overdue todos
      const { data: todos, error: todosErr } = await supabase
        .from('eos_todos')
        .select('due_date')
        .eq('tenant_id', SYSTEM_TENANT_ID)
        .eq('status', 'Open')
        .lt('due_date', today.toISOString().split('T')[0]);

      if (todosErr) throw todosErr;

      const overdueTaskCount = (todos ?? []).length;
      const overdue7dCount = (todos ?? []).filter(t => t.due_date && new Date(t.due_date) < sevenDaysAgo).length;

      // Recent audit events (7d)
      const { count, error: auditErr } = await supabase
        .from('audit_events')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo.toISOString());

      if (auditErr) throw auditErr;

      return {
        overdueTaskCount,
        overdue7dCount,
        recentAuditEvents: count ?? 0,
      } as IntegrityStats;
    },
    staleTime: 60_000,
  });
}

// ─── E. Financial Controls ───
export interface FinancialControlRow {
  id: string;
  tenant_id: number;
  control_type: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  amount_outstanding: number;
  notes: string | null;
}

export function useFinancialControls() {
  return useQuery({
    queryKey: ['ceo-financial-controls'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_controls' as any)
        .select('*')
        .order('due_date', { ascending: true });

      if (error) throw error;
      return (data ?? []) as unknown as FinancialControlRow[];
    },
    staleTime: 60_000,
  });
}

// ─── F. Risk & Capacity ───
export interface RiskCapacityStats {
  activeRisks: number;
  highRisks: number;
}

export function useRiskCapacity() {
  return useQuery({
    queryKey: ['ceo-risk-capacity'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('risk_flags')
        .select('severity');

      if (error) throw error;
      const rows = data ?? [];
      return {
        activeRisks: rows.length,
        highRisks: rows.filter(r => r.severity === 'high' || r.severity === 'critical').length,
      } as RiskCapacityStats;
    },
    staleTime: 60_000,
  });
}

// ─── G. Diamond Commitments ───
export function useDiamondCommitments() {
  return useQuery({
    queryKey: ['ceo-diamond-commitments'],
    queryFn: async () => {
      // Get diamond tenant IDs
      const { data: diamondTenants, error: tErr } = await (supabase
        .from('tenants')
        .select('id') as any)
        .eq('tier', 'diamond')
        .eq('status', 'active');

      if (tErr) throw tErr;
      const tenantIds = (diamondTenants ?? []).map(t => t.id);

      if (tenantIds.length === 0) return { upcoming: [], atRisk: 0, missed: 0 };

      const fourteenDaysFromNow = new Date();
      fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14);

      const { data, error } = await supabase
        .from('client_commitments' as any)
        .select('*')
        .in('tenant_id', tenantIds)
        .lte('due_date', fourteenDaysFromNow.toISOString().split('T')[0])
        .order('due_date', { ascending: true });

      if (error) throw error;
      const rows = (data ?? []) as any[];

      return {
        upcoming: rows.filter((r: any) => r.status === 'pending'),
        atRisk: rows.filter((r: any) => r.status === 'at_risk').length,
        missed: rows.filter((r: any) => r.status === 'missed').length,
      };
    },
    staleTime: 60_000,
  });
}

// ─── H. CEO Decision Queue ───
export interface DecisionQueueRow {
  id: string;
  title: string;
  impact_level: string;
  recommended_option: string | null;
  status: string;
  submitted_at: string;
  days_pending: number;
}

export function useCeoDecisionQueue() {
  return useQuery({
    queryKey: ['ceo-decision-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ceo_decision_queue' as any)
        .select('*')
        .eq('status', 'pending')
        .order('submitted_at', { ascending: true });

      if (error) throw error;

      const now = new Date();
      return ((data ?? []) as any[]).map((row: any) => ({
        id: row.id,
        title: row.title,
        impact_level: row.impact_level,
        recommended_option: row.recommended_option,
        status: row.status,
        submitted_at: row.submitted_at,
        days_pending: Math.floor((now.getTime() - new Date(row.submitted_at).getTime()) / (1000 * 60 * 60 * 24)),
      })) as DecisionQueueRow[];
    },
    staleTime: 60_000,
  });
}

// ─── I. KPI Score (via RPC) ───
export interface KpiScore {
  overall: number;
  eosExecution: number;
  unicornIntegrity: number;
  ceoRelief: number;
  financialAccuracy: number;
  status: string | null;
}

export function useKpiScoreRpc(tenantId: number = SYSTEM_TENANT_ID, days: number = 30) {
  return useQuery({
    queryKey: ['ceo-kpi-score-rpc', tenantId, days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('kpi_score_rolling' as any, {
        p_tenant_id: tenantId,
        p_days: days,
      });

      if (error) throw error;
      const result = data as any;

      return {
        overall: Math.round(result?.overall_score ?? 0),
        eosExecution: Math.round(result?.scores?.eos_execution ?? 0),
        unicornIntegrity: Math.round(result?.scores?.unicorn_integrity ?? 0),
        ceoRelief: Math.round(result?.scores?.ceo_relief ?? 0),
        financialAccuracy: Math.round(result?.scores?.financial_accuracy ?? 0),
        status: result?.status ?? null,
      } as KpiScore;
    },
    staleTime: 60_000,
  });
}

/**
 * Client-side fallback when RPC is unavailable or returns nulls.
 * Kept for backward compat.
 */
export function useCeoKpiScore(
  rockStats?: RockStats | null,
  todoStats?: TodoStats | null,
  integrityStats?: IntegrityStats | null,
  reliefStats?: CeoReliefStats | null,
  financialControls?: FinancialControlRow[]
): KpiScore {
  const eosExecution = (() => {
    if (!rockStats || !todoStats) return 0;
    const rockScore = rockStats.total > 0
      ? ((rockStats.on_track + rockStats.complete) / rockStats.total) * 100
      : 0;
    return Math.round((rockScore + todoStats.rollingAvg4w) / 2);
  })();

  const unicornIntegrity = (() => {
    if (!integrityStats) return 0;
    return Math.max(0, 100 - (integrityStats.overdueTaskCount * 5));
  })();

  const ceoRelief = reliefStats?.delegationPct ?? 0;

  const financialAccuracy = (() => {
    if (!financialControls || financialControls.length === 0) return 100;
    const ok = financialControls.filter(f => f.status === 'ok').length;
    return Math.round((ok / financialControls.length) * 100);
  })();

  const overall = Math.round(
    (eosExecution * 0.3) + (unicornIntegrity * 0.25) + (ceoRelief * 0.25) + (financialAccuracy * 0.2)
  );

  return { overall, eosExecution, unicornIntegrity, ceoRelief, financialAccuracy, status: overall >= 85 ? 'green' : overall >= 70 ? 'amber' : 'red' };
}
