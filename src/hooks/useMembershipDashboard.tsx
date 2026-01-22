import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  MembershipEntitlement,
  MembershipWithDetails,
  MembershipActivity,
  MembershipTask,
  MembershipNote,
  KPIStats,
  SavedView,
  MEMBERSHIP_TIERS,
  SUPERHERO_PACKAGE_IDS,
  MembershipHealthScore,
  MembershipRollup,
  NextAction,
  RiskFlag,
  PackagePhase,
  StageStatus,
} from '@/types/membership';

export function useMembershipDashboard() {
  const { profile } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<MembershipWithDetails[]>([]);
  const [activities, setActivities] = useState<MembershipActivity[]>([]);
  const [tasks, setTasks] = useState<MembershipTask[]>([]);
  const [staffUsers, setStaffUsers] = useState<Array<{ user_uuid: string; first_name: string; last_name: string; avatar_url: string | null }>>([]);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [savedView, setSavedView] = useState<SavedView>('all');
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedCSC, setSelectedCSC] = useState<string | null>(null);

  // Fetch staff users for CSC assignment (only actual CSCs)
  const fetchStaffUsers = useCallback(async () => {
    const { data } = await supabase
      .from('users')
      .select('user_uuid, first_name, last_name, avatar_url, staff_team')
      .eq('staff_team', 'csc');
    
    if (data) {
      setStaffUsers(data);
    }
  }, []);

  // Fetch memberships with tenant details - uses package_instances as source of truth
  const fetchMemberships = useCallback(async () => {
    setLoading(true);
    try {
      // Query package_instances directly - this is the source of truth for active memberships
      const { data: packageInstances, error: piError } = await supabase
        .from('package_instances')
        .select(`
          id,
          package_id,
          start_date,
          end_date,
          is_complete,
          tenant_id
        `)
        .eq('is_complete', false)
        .not('tenant_id', 'is', null)
        .in('package_id', SUPERHERO_PACKAGE_IDS);

      if (piError) throw piError;

      // Get tenant details for all tenant_ids
      const tenantIds = [...new Set((packageInstances || []).map(pi => pi.tenant_id).filter(Boolean) as number[])];
      
      if (tenantIds.length === 0) {
        setMemberships([]);
        setLoading(false);
        return;
      }

      const { data: tenants, error: tenantsError } = await supabase
        .from('tenants')
        .select('id, name, status')
        .in('id', tenantIds);

      if (tenantsError) throw tenantsError;

      const tenantMap = new Map(tenants?.map(t => [t.id, t]) || []);

      // Get packages
      const { data: packages } = await supabase
        .from('packages')
        .select('id, name, full_text')
        .in('id', SUPERHERO_PACKAGE_IDS);

      const packageMap = new Map(packages?.map(p => [p.id, p]) || []);

      // Get existing entitlements (for additional metadata like CSC, health check status)
      const { data: entitlements } = await supabase
        .from('membership_entitlements')
        .select('*');

      const entitlementMap = new Map(
        entitlements?.map(e => [`${e.tenant_id}-${e.package_id}`, e]) || []
      );

      // Get connected CSCs
      const { data: connected } = await supabase
        .from('connected_tenants')
        .select('tenant_id, user_uuid');

      const cscMap = new Map(connected?.map(c => [c.tenant_id, c.user_uuid]) || []);

      // Get overdue tasks count per tenant
      const { data: overdueTasks } = await supabase
        .from('membership_tasks')
        .select('tenant_id, package_id')
        .eq('status', 'pending')
        .lt('due_date', new Date().toISOString().split('T')[0]);

      const overdueMap = new Map<string, number>();
      overdueTasks?.forEach(t => {
        const key = `${t.tenant_id}-${t.package_id}`;
        overdueMap.set(key, (overdueMap.get(key) || 0) + 1);
      });

      // Get stage progress from RPC (uses stage-state table as source of truth)
      const { data: stageProgress } = await supabase.rpc('get_stage_progress');
      const progressMap = new Map<string, any>();
      (stageProgress || []).forEach((r: any) => {
        progressMap.set(`${r.tenant_id}-${r.package_id}`, r);
      });

      // Build membership list from package_instances
      const membershipList: MembershipWithDetails[] = [];

      for (const pi of packageInstances || []) {
        if (!pi.tenant_id) continue;
        
        const tenant = tenantMap.get(pi.tenant_id);
        if (!tenant) continue;

        const pkg = packageMap.get(pi.package_id);
        if (!pkg) continue;

        const tierKey = pkg.name as keyof typeof MEMBERSHIP_TIERS;
        const tier = MEMBERSHIP_TIERS[tierKey];
        if (!tier) continue;

        const key = `${tenant.id}-${pi.package_id}`;
        const entitlement = entitlementMap.get(key);
        const cscUserId = entitlement?.csc_user_id || cscMap.get(tenant.id);
        const cscUser = staffUsers.find(u => u.user_uuid === cscUserId);
        const progress = progressMap.get(key);

        // Calculate health score with overdue tasks and CSC assignment status
        const overdueCount = overdueMap.get(key) || 0;
        const hasCscAssigned = !!cscUserId;
        const healthScore: MembershipHealthScore = calculateHealthScore(entitlement, tier, overdueCount, hasCscAssigned);

        // Build next_action based on stage progress
        const nextAction: NextAction | null = progress?.current_stage_name ? {
          title: `Continue: ${progress.current_stage_name}`,
          due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          owner_id: cscUserId || null,
          source: 'system' as const,
          reason: progress.current_stage_status === 'blocked' ? 'Stage blocked' : 'In progress',
        } : {
          title: 'Review status and set next steps',
          due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          owner_id: cscUserId || null,
          source: 'system',
          reason: 'No stage data',
        };

        // Build risk flags from stage progress
        const riskFlags: RiskFlag[] = [];
        if (progress?.blocked_count > 0) {
          riskFlags.push({
            code: 'STAGE_OVERDUE',
            severity: 'critical',
            message: `${progress.blocked_count} stage${progress.blocked_count > 1 ? 's' : ''} blocked`,
            source: 'stage',
          });
        }
        if (overdueCount > 0) {
          riskFlags.push({
            code: 'OVERDUE_TASKS',
            severity: 'warn',
            message: `${overdueCount} overdue task${overdueCount > 1 ? 's' : ''}`,
            source: 'task',
          });
        }
        if (!hasCscAssigned) {
          riskFlags.push({
            code: 'MISSING_CSC',
            severity: 'warn',
            message: 'No CSC assigned',
            source: 'system',
          });
        }

        membershipList.push({
          id: entitlement?.id || `temp-${key}`,
          package_instance_id: pi.id,
          tenant_id: tenant.id,
          package_id: pi.package_id,
          hours_included_monthly: tier.hoursIncluded,
          hours_used_current_month: entitlement?.hours_used_current_month || 0,
          month_start_date: entitlement?.month_start_date || new Date().toISOString().split('T')[0],
          membership_state: entitlement?.membership_state || 'active',
          setup_complete: entitlement?.setup_complete || false,
          setup_completed_at: entitlement?.setup_completed_at || null,
          health_check_status: entitlement?.health_check_status || 'not_scheduled',
          health_check_scheduled_date: entitlement?.health_check_scheduled_date || null,
          validation_status: entitlement?.validation_status || 'not_scheduled',
          validation_scheduled_date: entitlement?.validation_scheduled_date || null,
          csc_user_id: cscUserId || null,
          membership_started_at: pi.start_date || entitlement?.membership_started_at || new Date().toISOString(),
          last_activity_at: entitlement?.last_activity_at || null,
          created_at: entitlement?.created_at || new Date().toISOString(),
          updated_at: entitlement?.updated_at || new Date().toISOString(),
          tenant_name: tenant.name,
          package_name: pkg.name,
          tier,
          csc_name: cscUser ? `${cscUser.first_name} ${cscUser.last_name}` : null,
          csc_avatar: cscUser?.avatar_url || null,
          health_score: healthScore,
          overdue_tasks_count: overdueMap.get(key) || 0,
          pending_tasks_count: 0,
          next_action: nextAction,
          risk_flags: riskFlags,
          // Deterministic stage fields from stage-state table
          current_stage_name: progress?.current_stage_name || null,
          current_stage_status: progress?.current_stage_status || null,
          progress_percent: progress?.percent_complete || 0,
          phase: null, // Not applicable for memberships
        });
      }

      setMemberships(membershipList);
    } catch (error: any) {
      toast({
        title: 'Error loading memberships',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [staffUsers, toast]);

  // Calculate health score with comprehensive risk factors
  const calculateHealthScore = (
    entitlement: MembershipEntitlement | undefined, 
    tier: typeof MEMBERSHIP_TIERS[string],
    overdueTasksCount: number = 0,
    hasCscAssigned: boolean = false
  ): MembershipHealthScore => {
    let score = 100;
    const riskFactors: Array<{ type: string; message: string }> = [];

    if (!entitlement) {
      return { score: 80, status: 'healthy', risk_factors: [{ type: 'new', message: 'New membership - no entitlement record' }] };
    }

    // Overdue tasks check
    if (overdueTasksCount > 0) {
      score -= Math.min(25, overdueTasksCount * 5);
      riskFactors.push({ type: 'overdue_tasks', message: `${overdueTasksCount} overdue task${overdueTasksCount > 1 ? 's' : ''}` });
    }

    // Hours check
    if (tier.hoursIncluded > 0) {
      const pct = (entitlement.hours_used_current_month / tier.hoursIncluded) * 100;
      if (pct >= 90) {
        score -= 30;
        riskFactors.push({ type: 'hours_critical', message: `Hours at ${pct.toFixed(0)}%` });
      } else if (pct >= 70) {
        score -= 15;
        riskFactors.push({ type: 'hours_warning', message: `Hours at ${pct.toFixed(0)}%` });
      }
    }

    // Activity check (no activity in X days)
    if (entitlement.last_activity_at) {
      const daysSince = Math.floor((Date.now() - new Date(entitlement.last_activity_at).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince > 21) {
        score -= 20;
        riskFactors.push({ type: 'no_activity', message: `No activity in ${daysSince} days` });
      }
    } else {
      score -= 10;
      riskFactors.push({ type: 'no_activity', message: 'No recorded activity' });
    }

    // Missing CSC assignment check
    if (!hasCscAssigned) {
      score -= 10;
      riskFactors.push({ type: 'no_csc', message: 'No CSC assigned' });
    }

    // Obligations check
    if (entitlement.health_check_status === 'not_scheduled') {
      score -= 10;
      riskFactors.push({ type: 'obligation', message: 'Health Check not scheduled' });
    }
    if (entitlement.validation_status === 'not_scheduled') {
      score -= 10;
      riskFactors.push({ type: 'obligation', message: 'Validation not scheduled' });
    }

    score = Math.max(0, Math.min(100, score));

    return {
      score,
      status: score >= 80 ? 'healthy' : score >= 50 ? 'warning' : 'critical',
      risk_factors: riskFactors,
    };
  };

  // Fetch activities
  const fetchActivities = useCallback(async () => {
    const { data } = await supabase
      .from('membership_activity')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) {
      setActivities(data);
    }
  }, []);

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    const { data } = await supabase
      .from('membership_tasks')
      .select('*')
      .neq('status', 'completed')
      .order('due_date', { ascending: true });

    if (data) {
      setTasks(data);
    }
  }, []);

  // Calculate KPI stats
  const kpiStats = useMemo<KPIStats>(() => {
    const today = new Date().toISOString().split('T')[0];
    
    return {
      overdueActions: memberships.reduce((sum, m) => sum + m.overdue_tasks_count, 0),
      hoursAtRisk: memberships.filter(m => 
        m.tier.hoursIncluded > 0 && 
        (m.hours_used_current_month / m.tier.hoursIncluded) >= 0.7
      ).length,
      obligationsDue: memberships.filter(m =>
        m.health_check_status === 'not_scheduled' || m.validation_status === 'not_scheduled'
      ).length,
      noActivity21Days: memberships.filter(m => {
        if (!m.last_activity_at) return true;
        const daysSince = Math.floor((Date.now() - new Date(m.last_activity_at).getTime()) / (1000 * 60 * 60 * 24));
        return daysSince > 21;
      }).length,
      atRiskMemberships: memberships.filter(m => m.membership_state === 'at_risk').length,
    };
  }, [memberships]);

  // Filter memberships
  const filteredMemberships = useMemo(() => {
    let filtered = [...memberships];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(m =>
        m.tenant_name.toLowerCase().includes(query) ||
        m.csc_name?.toLowerCase().includes(query) ||
        m.package_name.toLowerCase().includes(query)
      );
    }

    // Saved view filters
    switch (savedView) {
      case 'my_memberships':
        filtered = filtered.filter(m => m.csc_user_id === profile?.user_uuid);
        break;
      case 'overdue_actions':
        filtered = filtered.filter(m => m.overdue_tasks_count > 0);
        break;
      case 'hours_at_risk':
        filtered = filtered.filter(m => 
          m.tier.hoursIncluded > 0 && 
          (m.hours_used_current_month / m.tier.hoursIncluded) >= 0.7
        );
        break;
      case 'obligations_due':
        filtered = filtered.filter(m =>
          m.health_check_status === 'not_scheduled' || m.validation_status === 'not_scheduled'
        );
        break;
    }

    // Tier filter
    if (selectedTier) {
      filtered = filtered.filter(m => m.package_name === selectedTier);
    }

    // State filter
    if (selectedState) {
      filtered = filtered.filter(m => m.membership_state === selectedState);
    }

    // CSC filter
    if (selectedCSC) {
      filtered = filtered.filter(m => m.csc_user_id === selectedCSC);
    }

    return filtered;
  }, [memberships, searchQuery, savedView, selectedTier, selectedState, selectedCSC, profile?.user_uuid]);

  // Update CSC assignment
  const updateCSC = useCallback(async (tenantId: number, packageId: number, cscUserId: string | null) => {
    try {
      // Upsert entitlement record
      const { error } = await supabase
        .from('membership_entitlements')
        .upsert({
          tenant_id: tenantId,
          package_id: packageId,
          csc_user_id: cscUserId,
          hours_included_monthly: MEMBERSHIP_TIERS[Object.keys(MEMBERSHIP_TIERS).find(k => MEMBERSHIP_TIERS[k].id === packageId) || 'M-AM']?.hoursIncluded || 0,
        }, {
          onConflict: 'tenant_id,package_id',
        });

      if (error) throw error;

      toast({
        title: 'CSC Updated',
        description: 'Client Success Champion assignment updated successfully.',
      });

      fetchMemberships();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [fetchMemberships, toast]);

  // Update membership state
  const updateMembershipState = useCallback(async (tenantId: number, packageId: number, state: string) => {
    try {
      const { error } = await supabase
        .from('membership_entitlements')
        .upsert({
          tenant_id: tenantId,
          package_id: packageId,
          membership_state: state,
          hours_included_monthly: 0,
        }, {
          onConflict: 'tenant_id,package_id',
        });

      if (error) throw error;

      toast({
        title: 'State Updated',
        description: `Membership state changed to ${state}.`,
      });

      fetchMemberships();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [fetchMemberships, toast]);

  // Log consult hours
  const logConsultHours = useCallback(async (tenantId: number, packageId: number, minutes: number, notes: string) => {
    try {
      // Update hours used
      const membership = memberships.find(m => m.tenant_id === tenantId && m.package_id === packageId);
      const newHoursUsed = (membership?.hours_used_current_month || 0) + Math.ceil(minutes / 60);

      await supabase
        .from('membership_entitlements')
        .upsert({
          tenant_id: tenantId,
          package_id: packageId,
          hours_used_current_month: newHoursUsed,
          last_activity_at: new Date().toISOString(),
          hours_included_monthly: membership?.hours_included_monthly || 0,
        }, {
          onConflict: 'tenant_id,package_id',
        });

      // Log activity
      await supabase
        .from('membership_activity')
        .insert({
          tenant_id: tenantId,
          package_id: packageId,
          user_id: profile?.user_uuid,
          activity_type: 'consult_logged',
          title: `Logged ${minutes} minutes consultation`,
          description: notes,
        });

      toast({
        title: 'Consult Logged',
        description: `${minutes} minutes logged successfully.`,
      });

      fetchMemberships();
      fetchActivities();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [memberships, profile?.user_uuid, fetchMemberships, fetchActivities, toast]);

  // Add note
  const addNote = useCallback(async (tenantId: number, packageId: number, content: string) => {
    try {
      await supabase
        .from('membership_notes')
        .insert({
          tenant_id: tenantId,
          package_id: packageId,
          content,
          created_by: profile?.user_uuid,
        });

      // Update last activity
      await supabase
        .from('membership_entitlements')
        .upsert({
          tenant_id: tenantId,
          package_id: packageId,
          last_activity_at: new Date().toISOString(),
          hours_included_monthly: 0,
        }, {
          onConflict: 'tenant_id,package_id',
        });

      // Log activity
      await supabase
        .from('membership_activity')
        .insert({
          tenant_id: tenantId,
          package_id: packageId,
          user_id: profile?.user_uuid,
          activity_type: 'note_added',
          title: 'Note added',
          description: content.substring(0, 100),
        });

      toast({
        title: 'Note Added',
        description: 'Note saved successfully.',
      });

      fetchMemberships();
      fetchActivities();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [profile?.user_uuid, fetchMemberships, fetchActivities, toast]);

  // Create task
  const createTask = useCallback(async (tenantId: number, packageId: number, title: string, dueDate: string | null, priority: string = 'normal') => {
    try {
      await supabase
        .from('membership_tasks')
        .insert({
          tenant_id: tenantId,
          package_id: packageId,
          title,
          due_date: dueDate,
          priority,
          created_by: profile?.user_uuid,
          assigned_to: profile?.user_uuid,
        });

      // Log activity
      await supabase
        .from('membership_activity')
        .insert({
          tenant_id: tenantId,
          package_id: packageId,
          user_id: profile?.user_uuid,
          activity_type: 'task_created',
          title: `Task created: ${title}`,
        });

      toast({
        title: 'Task Created',
        description: 'Task added successfully.',
      });

      fetchTasks();
      fetchActivities();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [profile?.user_uuid, fetchTasks, fetchActivities, toast]);

  // Initial load
  useEffect(() => {
    fetchStaffUsers();
  }, [fetchStaffUsers]);

  useEffect(() => {
    if (staffUsers.length > 0) {
      fetchMemberships();
      fetchActivities();
      fetchTasks();
    }
  }, [staffUsers, fetchMemberships, fetchActivities, fetchTasks]);

  return {
    loading,
    memberships: filteredMemberships,
    allMemberships: memberships,
    activities,
    tasks,
    staffUsers,
    kpiStats,
    searchQuery,
    setSearchQuery,
    savedView,
    setSavedView,
    selectedTier,
    setSelectedTier,
    selectedState,
    setSelectedState,
    selectedCSC,
    setSelectedCSC,
    updateCSC,
    updateMembershipState,
    logConsultHours,
    addNote,
    createTask,
    refresh: fetchMemberships,
  };
}
