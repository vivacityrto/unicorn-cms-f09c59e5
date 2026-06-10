## Plan: Role-Aware rawTenants Query in useDashboardTriage.ts

### Goal
Replace the single `rawTenants` query in `src/hooks/useDashboardTriage.ts` with a role-aware strategy to improve performance for non-SuperAdmin users viewing "All Clients".

### Change Detail

In `src/hooks/useDashboardTriage.ts` (lines 227–249):

- **SuperAdmin** users and **"My Clients"** view: continue querying `v_dashboard_attention_ranked` with full computed metrics.
- **Non-SuperAdmin "All Clients"** view: switch to a lightweight query on the `tenants` table selecting only `id, name, status, lifecycle_status, risk_level, assigned_consultant_user_id, created_at`, sorted by name. Zero out all computed metric fields to satisfy the `AttentionTenant` return type.

This avoids the expensive materialized/computed view for users who do not need ranked attention scoring across the entire portfolio.

### Exact Replacement

Replace the current `useQuery` block (lines 227–249) with the following:

```typescript
const { data: rawTenants = [], isLoading: tenantsLoading } = useQuery({
  queryKey: ['triage-attention-ranked', isSuperAdmin, savedView, profile?.user_uuid],
  queryFn: async () => {
    if (isSuperAdmin || savedView === 'my_tenants') {
      let query = (supabase as any)
        .from('v_dashboard_attention_ranked')
        .select('*')
        .order('attention_score', { ascending: false });
      if (!isSuperAdmin && profile?.user_uuid) {
        query = query.eq('assigned_csc_user_id', profile.user_uuid);
      } else if (isSuperAdmin) {
        query = query.limit(500);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as AttentionTenant[];
    }
    // Non-SA "All Clients": fast lightweight list, sorted by name
    const { data, error } = await supabase
      .from('tenants')
      .select('id, name, status, lifecycle_status, risk_level, assigned_consultant_user_id, created_at')
      .eq('status', 'active')
      .not('is_system_tenant', 'eq', true)
      .order('name')
      .limit(500);
    if (error) throw error;
    return (data || []).map((t: any) => ({
      tenant_id: t.id, tenant_name: t.name, tenant_status: t.status,
      lifecycle_status: t.lifecycle_status,
      assigned_csc_user_id: t.assigned_consultant_user_id ?? null,
      risk_status: t.risk_level ?? 'stable',
      attention_score: 0, stage_score: 0, gaps_score: 0, risk_score: 0,
      staleness_score: 0, task_score: 0, renewal_score: 0, burn_score: 0,
      worst_stage_health_status: null, critical_stage_count: 0, at_risk_stage_count: 0,
      open_tasks_count: 0, overdue_tasks_count: 0, mandatory_gaps_count: 0,
      consult_hours_30d: 0, burn_risk_status: 'normal', retention_status: 'stable',
      high_severity_open_risks: 0, compliance_overdue_tasks: 0,
      compliance_blocked_tasks: 0, compliance_open_tasks: 0,
      days_since_activity: null, days_to_renewal: null, last_activity_at: null,
      renewal_window_start: null, attention_drivers_json: null, packages_json: null,
      risk_index: 0, risk_index_delta_14d: 0, composite_retention_risk_index: null,
      projected_exhaustion_date: null, abn: null, rto_id: null, cricos_id: null,
    })) as unknown as AttentionTenant[];
  },
  enabled: isVivacityStaff,
  staleTime: 60_000,
});
```

### Files Changed
- `src/hooks/useDashboardTriage.ts` (single block replacement, lines 227–249)

### Impact
- Non-SA users in "All Clients" get an instant list instead of waiting on `v_dashboard_attention_ranked`.
- No functional change for SuperAdmins or "My Clients" view.
- Zeroed metrics means downstream filters relying on computed fields (e.g., `mandatoryGapsOnly`, `burnRiskOnly`) will return empty results for non-SA "All Clients", which is acceptable because those users should switch to "My Clients" or detailed views for metric-driven triage.