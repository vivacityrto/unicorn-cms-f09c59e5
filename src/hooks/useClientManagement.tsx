import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/** Stage types excluded from the progress bar (ongoing or exit stages) — static fallback */
const NON_TRACKABLE_STAGE_TYPES = ['offboarding', 'monitor', 'monitoring'];

export interface ClientPackage {
  id: string;
  package_id: number;
  package_name: string;
  package_slug: string | null;
  package_full_text: string | null;
  membership_state: string;
  hours_included: number;
  hours_used: number;
  current_stage_name: string | null;
  completed_stages: number;
  total_stages: number;
  /** Stages that count toward progress (excludes offboarding/monitor/finalise) */
  trackable_completed: number;
  trackable_total: number;
  /** Number of stages classified as 'monitor' */
  monitor_stages: number;
  has_blocked_stages: boolean;
  membership_started_at: string;
  is_complete: boolean;
  completed_at?: string | null;
  next_renewal_date?: string | null;
  last_renewed_date?: string | null;
}

export interface ClientSummary {
  id: number;
  name: string;
  slug: string;
  status: string;
  risk_level: string;
  created_at: string;
  member_count: number;
  csc_name: string | null;
  csc_avatar: string | null;
  csc_user_id: string | null;
  packages: {
    id: number;
    name: string;
    slug: string | null;
    membership_state: string;
    current_stage: string | null;
    progress_percent: number;
    has_blocked: boolean;
  }[];
  state: string | null;
  rto_number: string | null;
}

export interface ClientProfile {
  tenant_id: number;
  legal_name: string | null;
  trading_name: string | null;
  abn: string | null;
  acn: string | null;
  org_type: string | null;
  website: string | null;
  state: string | null;
  rto_number: string | null;
  cricos_number: string | null;
  lms: string | null;
  sms: string | null;
  accounting_system: string | null;
  risk_level: string | null;
  updated_at: string | null;
  phone1: string | null;
}

export interface RegistryLink {
  id: string;
  tenant_id: number;
  registry: string;
  external_id: string | null;
  link_status: string;
  last_synced_at: string | null;
  last_error: string | null;
  verified_at: string | null;
  verified_by: string | null;
}

export function useClientManagement() {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<{ id: number; name: string; slug: string | null }[]>([]);
  const { toast } = useToast();

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch all tenants
      const { data: tenantsData, error: tenantsError } = await supabase
        .from('tenants')
        .select('id, name, slug, status, risk_level, created_at')
        .order('name');

      if (tenantsError) throw tenantsError;
      if (!tenantsData || tenantsData.length === 0) {
        setClients([]);
        setLoading(false);
        return;
      }

      const tenantIds = tenantsData.map(t => t.id);

      // Fetch all membership entitlements with package details
      const { data: entitlements } = await (supabase as any)
        .from('membership_entitlements')
        .select(`
          id,
          tenant_id,
          package_id,
          membership_state,
          hours_included_monthly,
          hours_used_current_month,
          packages(id, name, slug)
        `)
        .in('tenant_id', tenantIds);

      // Fetch stage progress for each entitlement
      const { data: stageProgress } = await supabase
        .from('client_package_stage_state')
        .select('tenant_id, package_id, status')
        .in('tenant_id', tenantIds);

      // Fetch member counts
      const { data: memberCounts } = await supabase
        .from('users')
        .select('tenant_id')
        .in('tenant_id', tenantIds);

      const memberCountMap = (memberCounts || []).reduce((acc, user) => {
        acc[user.tenant_id] = (acc[user.tenant_id] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);

      // Fetch CSC assignments from connected_tenants
      const { data: connectedData } = await supabase
        .from('connected_tenants')
        .select('tenant_id, user_uuid')
        .in('tenant_id', tenantIds);

      const connectedMap = (connectedData || []).reduce((acc, conn) => {
        if (!acc[conn.tenant_id]) {
          acc[conn.tenant_id] = conn.user_uuid;
        }
        return acc;
      }, {} as Record<number, string>);

      // Fetch CSC user details
      const userUuids = Object.values(connectedMap).filter(Boolean);
      const { data: usersData } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name, avatar_url')
        .in('user_uuid', userUuids);

      const userDataMap = (usersData || []).reduce((acc, user) => {
        acc[user.user_uuid] = {
          name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
          avatar: user.avatar_url
        };
        return acc;
      }, {} as Record<string, { name: string; avatar: string | null }>);

      // Fetch tenant profiles for RTO numbers
      const { data: profiles } = await supabase
        .from('tenant_profile')
        .select('tenant_id, rto_number, state')
        .in('tenant_id', tenantIds);

      const profileMap = (profiles || []).reduce((acc, p) => {
        acc[p.tenant_id] = { rto_number: p.rto_number, state: p.state };
        return acc;
      }, {} as Record<number, { rto_number: string | null; state: string | null }>);

      // Build package summary per tenant
      const entitlementsByTenant = (entitlements || []).reduce((acc, ent) => {
        if (!acc[ent.tenant_id]) acc[ent.tenant_id] = [];
        
        // Calculate stage progress
        const tenantPackageStages = (stageProgress || []).filter(
          s => s.tenant_id === ent.tenant_id && s.package_id === ent.package_id
        );
        const totalStages = tenantPackageStages.length;
        const completedStages = tenantPackageStages.filter(s => s.status === 'completed').length;
        const hasBlocked = tenantPackageStages.some(s => s.status === 'blocked');
        const activeStage = tenantPackageStages.find(s => s.status === 'active' || s.status === 'in_progress');

        acc[ent.tenant_id].push({
          id: ent.package_id,
          name: (ent.packages as any)?.name || 'Unknown',
          slug: (ent.packages as any)?.slug || null,
          membership_state: ent.membership_state,
          current_stage: activeStage ? 'In Progress' : totalStages > 0 && completedStages === totalStages ? 'Completed' : 'Not Started',
          progress_percent: totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0,
          has_blocked: hasBlocked
        });
        return acc;
      }, {} as Record<number, ClientSummary['packages']>);

      // Merge all data
      const clientsWithData: ClientSummary[] = tenantsData.map(tenant => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        risk_level: tenant.risk_level || 'low',
        created_at: tenant.created_at,
        member_count: memberCountMap[tenant.id] || 0,
        csc_name: connectedMap[tenant.id] ? userDataMap[connectedMap[tenant.id]]?.name || null : null,
        csc_avatar: connectedMap[tenant.id] ? userDataMap[connectedMap[tenant.id]]?.avatar || null : null,
        csc_user_id: connectedMap[tenant.id] || null,
        packages: entitlementsByTenant[tenant.id] || [],
        state: profileMap[tenant.id]?.state || null,
        rto_number: profileMap[tenant.id]?.rto_number || null
      }));

      setClients(clientsWithData);
    } catch (error: any) {
      console.error('Error fetching clients:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchPackages = useCallback(async () => {
    const { data, error } = await supabase
      .from('packages')
      .select('id, name, slug')
      .order('name');
    
    if (!error && data) {
      setPackages(data);
    }
  }, []);

  useEffect(() => {
    fetchClients();
    fetchPackages();
  }, [fetchClients, fetchPackages]);

  return {
    clients,
    packages,
    loading,
    refreshClients: fetchClients
  };
}

export function useClientProfile(tenantId: number | null) {
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [registryLink, setRegistryLink] = useState<RegistryLink | null>(null);
  const [tgaConnected, setTgaConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchProfile = useCallback(async () => {
    if (!tenantId) return;
    
    try {
      setLoading(true);
      
      const [tenantResult, linkResult, tgaSummaryResult, tpResult] = await Promise.all([
        supabase
          .from('tenants')
          .select('id, legal_name, rto_name, abn, acn, website, state, rto_id, cricos_id, lms, sms, accounting_system, risk_level, updated_at, tga_status')
          .eq('id', tenantId)
          .single(),
        supabase
          .from('tenant_registry_links')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('registry', 'tga')
          .maybeSingle(),
        supabase
          .from('tga_rto_summary')
          .select('legal_name, trading_name, abn, acn, web_address, organisation_type')
          .eq('tenant_id', tenantId)
          .maybeSingle(),
        supabase
          .from('tenant_profile')
          .select('phone1, org_type')
          .eq('tenant_id', tenantId)
          .maybeSingle()
      ]);

      if (tenantResult.error) {
        throw tenantResult.error;
      }

      const tenant = tenantResult.data;
      const tgaConnected = tenant.tga_status === 'connected';
      const tga = tgaConnected ? tgaSummaryResult.data : null;

      // Map TGA organisation classification to our org_type enum
      let tgaOrgType: string | null = null;
      if (tga?.organisation_type) {
        const orgTypeLower = tga.organisation_type.toLowerCase();
        if (orgTypeLower.includes('registered training organisation')) {
          tgaOrgType = 'rto';
        }
      }
      // If tenant has both RTO and CRICOS, override to rto_cricos
      if (tgaOrgType === 'rto' && tenant.cricos_id) {
        tgaOrgType = 'rto_cricos';
      }

      // Derive org_type from active membership packages when TGA and stored value are both empty
      const storedOrgType = tpResult.data?.org_type || null;
      let derivedOrgType = tgaOrgType || storedOrgType;
      if (!derivedOrgType) {
        const { data: activePkgs } = await supabase
          .from('package_instances')
          .select('package_id')
          .eq('tenant_id', tenantId)
          .eq('is_complete', false);
        if (activePkgs && activePkgs.length > 0) {
          const pkgIds = activePkgs.map(p => p.package_id);
          const { data: pkgNames } = await supabase
            .from('packages')
            .select('name')
            .in('id', pkgIds);
          if (pkgNames) {
            const hasRto = pkgNames.some(p => /M-.*R/i.test(p.name));
            const hasCricos = pkgNames.some(p => /M-.*C/i.test(p.name));
            if (hasRto && hasCricos) derivedOrgType = 'rto_cricos';
            else if (hasRto) derivedOrgType = 'rto';
            else if (hasCricos) derivedOrgType = 'cricos';
          }
        }
      }

      // Map tenant columns to ClientProfile interface, overlaying TGA data where available
      const profileData: ClientProfile = {
        tenant_id: tenant.id,
        legal_name: tga?.legal_name || tenant.legal_name,
        trading_name: tga?.trading_name || tenant.rto_name,
        abn: tga?.abn || tenant.abn,
        acn: tga?.acn || tenant.acn,
        org_type: derivedOrgType,
        website: tga?.web_address || tenant.website,
        state: tenant.state,
        rto_number: tenant.rto_id,
        cricos_number: tenant.cricos_id,
        lms: tenant.lms,
        sms: tenant.sms,
        accounting_system: tenant.accounting_system,
        risk_level: tenant.risk_level,
        updated_at: tenant.updated_at,
        phone1: tpResult.data?.phone1 || null
      };

      setProfile(profileData);
      setTgaConnected(tgaConnected);
      setRegistryLink(linkResult.data);
    } catch (error: any) {
      console.error('Error fetching client profile:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  const saveProfile = useCallback(async (updates: Partial<ClientProfile>) => {
    if (!tenantId) return false;

    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      // Get old values for audit
      const oldProfile = profile;

      // Map interface fields back to tenants column names
      const tenantUpdates: Record<string, any> = {};
      if ('legal_name' in updates) tenantUpdates.legal_name = updates.legal_name;
      if ('trading_name' in updates) tenantUpdates.rto_name = updates.trading_name;
      if ('abn' in updates) tenantUpdates.abn = updates.abn;
      if ('acn' in updates) tenantUpdates.acn = updates.acn;
      if ('website' in updates) tenantUpdates.website = updates.website;
      if ('state' in updates) tenantUpdates.state = updates.state;
      if ('rto_number' in updates) tenantUpdates.rto_id = updates.rto_number;
      if ('cricos_number' in updates) tenantUpdates.cricos_id = updates.cricos_number;
      if ('lms' in updates) tenantUpdates.lms = updates.lms;
      if ('sms' in updates) tenantUpdates.sms = updates.sms;
      if ('accounting_system' in updates) tenantUpdates.accounting_system = updates.accounting_system;
      if ('risk_level' in updates) tenantUpdates.risk_level = updates.risk_level;
      tenantUpdates.updated_at = new Date().toISOString();

      // Handle phone1 and org_type separately (stored in tenant_profile)
      const profileUpdates: Record<string, any> = {};
      if ('phone1' in updates) profileUpdates.phone1 = updates.phone1;
      if ('org_type' in updates) profileUpdates.org_type = updates.org_type;
      if (Object.keys(profileUpdates).length > 0) {
        const { error: profileError } = await supabase
          .from('tenant_profile')
          .upsert({ tenant_id: tenantId, ...profileUpdates }, { onConflict: 'tenant_id' });
        if (profileError) throw profileError;
      }

      const { error } = await supabase
        .from('tenants')
        .update(tenantUpdates)
        .eq('id', tenantId);

      if (error) throw error;

      // Log audit
      await supabase.from('client_audit_log').insert([{
        tenant_id: tenantId,
        actor_user_id: userId || undefined,
        action: 'client_profile_updated',
        entity_type: 'tenants',
        entity_id: tenantId.toString(),
        details: JSON.parse(JSON.stringify({
          old_values: oldProfile,
          new_values: updates,
          changed_fields: Object.keys(updates)
        }))
      }]);

      toast({
        title: 'Success',
        description: 'Client profile saved successfully'
      });

      await fetchProfile();
      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      return false;
    }
  }, [tenantId, profile, fetchProfile, toast]);

  // Set TGA link with role-based auto-verification via RPC
  const setTgaLink = useCallback(async (rtoNumber: string): Promise<{ success: boolean; status?: string; autoVerified?: boolean }> => {
    if (!tenantId) return { success: false };

    try {
      const { data, error } = await supabase.rpc('client_tga_link_set', {
        p_tenant_id: tenantId,
        p_rto_number: rtoNumber
      });

      if (error) throw error;

      const result = data as { success: boolean; status: string; auto_verified: boolean };

      toast({
        title: 'Success',
        description: result.auto_verified 
          ? 'TGA link verified automatically' 
          : 'TGA link initiated - awaiting admin verification'
      });

      await fetchProfile();
      return { success: true, status: result.status, autoVerified: result.auto_verified };
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      return { success: false };
    }
  }, [tenantId, fetchProfile, toast]);

  // Verify pending TGA link (Admin-only) via RPC
  const verifyTgaLink = useCallback(async (): Promise<boolean> => {
    if (!tenantId) return false;

    try {
      const { data, error } = await supabase.rpc('client_tga_link_verify', {
        p_tenant_id: tenantId
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'TGA link verified successfully'
      });

      await fetchProfile();
      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      return false;
    }
  }, [tenantId, fetchProfile, toast]);

  // Simple status update for unlink/clear operations
  const updateRegistryLink = useCallback(async (status: string, externalId?: string) => {
    if (!tenantId) return false;

    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      const oldLink = registryLink;

      const { error } = await supabase
        .from('tenant_registry_links')
        .upsert({
          tenant_id: tenantId,
          registry: 'tga',
          link_status: status,
          external_id: externalId || profile?.rto_number || null,
          updated_by: userId,
          verified_at: null,
          verified_by: null,
          last_synced_at: status === 'linked' ? new Date().toISOString() : registryLink?.last_synced_at
        }, { onConflict: 'tenant_id,registry' });

      if (error) throw error;

      // Log audit
      await supabase.from('client_audit_log').insert([{
        tenant_id: tenantId,
        actor_user_id: userId || undefined,
        action: 'registry_link_updated',
        entity_type: 'tenant_registry_links',
        entity_id: tenantId.toString(),
        details: JSON.parse(JSON.stringify({
          registry: 'tga',
          old_status: oldLink?.link_status,
          new_status: status
        }))
      }]);

      toast({
        title: 'Success',
        description: `TGA link status updated to ${status}`
      });

      await fetchProfile();
      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      return false;
    }
  }, [tenantId, profile, registryLink, fetchProfile, toast]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return {
    profile,
    registryLink,
    tgaConnected,
    loading,
    saveProfile,
    setTgaLink,
    verifyTgaLink,
    updateRegistryLink,
    refreshProfile: fetchProfile
  };
}

export function useClientPackages(tenantId: number | null) {
  const [packages, setPackages] = useState<ClientPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchPackages = useCallback(async () => {
    if (!tenantId) return;

    try {
      setLoading(true);

      // Fetch ALL package instances (active + completed) for history support
      const { data: instances, error } = await supabase
        .from('package_instances')
        .select('id, tenant_id, package_id, start_date, is_complete, included_minutes, hours_included, hours_used, hours_added, membership_state, end_date, next_renewal_date, last_renewed_date')
        .eq('tenant_id', tenantId)
        .order('start_date', { ascending: false }) as { data: any[] | null; error: any };

      if (error) throw error;

      // Get unique package IDs to fetch package details
      const packageIds = [...new Set((instances || []).map(i => i.package_id))];

      // Fetch package details and stage instances in parallel
      const instanceIds = (instances || []).map(i => i.id);
      const [packagesResult, stageInstancesResult] = await Promise.all([
        packageIds.length > 0
          ? supabase.from('packages').select('id, name, slug, full_text').in('id', packageIds)
          : Promise.resolve({ data: [] }),
        instanceIds.length > 0
          ? supabase.from('stage_instances').select('id, packageinstance_id, stage_id, status, stage_sortorder, completion_date').in('packageinstance_id', instanceIds).order('stage_sortorder')
          : Promise.resolve({ data: [] })
      ]);

      const packagesMap = ((packagesResult as any).data || []).reduce((acc: Record<number, any>, pkg: any) => {
        acc[pkg.id] = pkg;
        return acc;
      }, {} as Record<number, any>);

      const stageInstances = (stageInstancesResult as any).data || [];

      // Fetch stage names from stages for current stage display
      const stageIdSet = new Set<number>();
      stageInstances.forEach((s: any) => stageIdSet.add(Number(s.stage_id)));
      const stageIds = Array.from(stageIdSet);
      const stageNamesResult = stageIds.length > 0
        ? await (supabase.from('stages').select('id, name, stage_type') as any).in('id', stageIds)
        : { data: [] };
      const stageMetaMap = ((stageNamesResult as any).data || []).reduce((acc: Record<number, { name: string; stage_type: string | null }>, s: any) => {
        acc[s.id] = { name: s.name, stage_type: s.stage_type };
        return acc;
      }, {} as Record<number, { name: string; stage_type: string | null }>);

      // Build package data with stage info
      const packageData: ClientPackage[] = (instances || []).map(inst => {
        const pkg = packagesMap[inst.package_id];
        const pkgStages = stageInstances.filter((s: any) => s.packageinstance_id === inst.id);
        const totalStages = pkgStages.length;
        const completedStages = pkgStages.filter((s: any) => s.status === 'completed' || s.status === '3').length;
        const hasBlocked = pkgStages.some((s: any) => s.status === 'blocked');

        // Trackable stages exclude offboarding/monitor/finalise
        const trackableStages = pkgStages.filter((s: any) => {
          const sType = stageMetaMap[s.stage_id]?.stage_type?.toLowerCase();
          return !NON_TRACKABLE_STAGE_TYPES.includes(sType || '');
        });
        const trackableCompleted = trackableStages.filter((s: any) => s.status === 'completed' || s.status === '3').length;
        const monitorStages = pkgStages.filter((s: any) => {
          const sType = stageMetaMap[s.stage_id]?.stage_type?.toLowerCase();
          return sType === 'monitor';
        }).length;
        const activeStage = pkgStages.find((s: any) => 
          s.status !== 'completed' && s.status !== '3' && s.status !== 'na' && s.status !== 'not_started'
        ) || pkgStages.find((s: any) => s.status === 'not_started');

        // Total hours = included_minutes (canonical) fallback to hours_included (deprecated) + added
        const baseMinutes = inst.included_minutes ?? (inst.hours_included ? inst.hours_included * 60 : 0);
        const totalHours = (baseMinutes / 60) + (inst.hours_added || 0);

        return {
          id: inst.id,
          package_id: inst.package_id,
          package_name: pkg?.name || 'Unknown',
          package_slug: pkg?.slug || null,
          package_full_text: pkg?.full_text || null,
          membership_state: inst.membership_state || (inst.is_complete ? 'exiting' : 'active'),
          hours_included: totalHours,
          hours_used: inst.hours_used || 0,
          current_stage_name: activeStage ? stageMetaMap[activeStage.stage_id]?.name || null : null,
          completed_stages: completedStages,
          total_stages: totalStages,
          trackable_completed: trackableCompleted,
          trackable_total: trackableStages.length,
          monitor_stages: monitorStages,
          has_blocked_stages: hasBlocked,
          membership_started_at: inst.start_date,
          is_complete: inst.is_complete || false,
          completed_at: inst.end_date || null,
          next_renewal_date: inst.next_renewal_date || null
        };
      });

      // Deduplicate active packages: keep only the most recent instance per package_id
      // Keep all completed packages for history
      const activePackages = packageData.filter(p => !p.is_complete);
      const completedPackages = packageData.filter(p => p.is_complete);
      
      const deduplicatedActive = Object.values(
        activePackages.reduce((acc, pkg) => {
          const key = pkg.package_id;
          if (!acc[key] || new Date(pkg.membership_started_at || 0) > new Date(acc[key].membership_started_at || 0)) {
            acc[key] = pkg;
          }
          return acc;
        }, {} as Record<number, typeof packageData[0]>)
      );

      setPackages([...deduplicatedActive, ...completedPackages]);
    } catch (error: any) {
      console.error('Error fetching client packages:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  return {
    packages,
    loading,
    refreshPackages: fetchPackages
  };
}
