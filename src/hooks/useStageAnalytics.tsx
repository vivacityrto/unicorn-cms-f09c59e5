import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StageAnalyticsKPIs {
  totalStages: number;
  certifiedStages: number;
  archivedStages: number;
  stagesInPackages: number;
  stagesWithActiveClients: number;
}

export interface TopStageByUsage {
  id: number;
  title: string;
  stage_type: string;
  is_certified: boolean;
  frameworks: string[] | null;
  packageCount: number;
  activeClientCount: number;
  updated_at: string;
}

export interface CertifiedUnusedStage {
  id: number;
  title: string;
  version_label: string | null;
  certified_at: string | null;
  updated_at: string;
}

export interface HighRiskStage {
  id: number;
  title: string;
  activeClientCount: number;
  editCount: number;
  lastEditDate: string | null;
  topEditor: string | null;
}

export interface StageAuditEvent {
  id: string;
  created_at: string;
  action: string;
  entity_id: string;
  stage_title: string | null;
  user_id: string | null;
  user_email: string | null;
  details: any;
}

interface UseStageAnalyticsOptions {
  dateRangeDays: number;
  frameworkFilter: string | null;
  stageTypeFilter: string | null;
  certifiedFilter: 'all' | 'certified' | 'uncertified';
}

export function useStageAnalytics(options: UseStageAnalyticsOptions) {
  const { dateRangeDays, frameworkFilter, stageTypeFilter, certifiedFilter } = options;

  // KPIs query
  const { data: kpis, isLoading: kpisLoading, refetch: refetchKpis } = useQuery({
    queryKey: ['stage-analytics-kpis'],
    queryFn: async (): Promise<StageAnalyticsKPIs> => {
      // Get all stages
      const { data: stages, error: stagesError } = await supabase
        .from('documents_stages')
        .select('id, is_certified, is_archived');
      
      if (stagesError) throw stagesError;

      // Get package_stages for unique stage usage
      const { data: packageStages, error: psError } = await supabase
        .from('package_stages' as any)
        .select('stage_id') as any;
      
      if (psError) throw psError;

      const stagesInPackagesSet = new Set((packageStages || []).map((ps: any) => ps.stage_id));

      // Try to get active client usage (may not be available)
      let stagesWithActiveClients = 0;
      try {
        const { data: activeClientStages } = await supabase
          .from('client_package_stages')
          .select('stage_id, client_package:client_packages!inner(status)')
          .in('client_package.status', ['active', 'in_progress']) as any;
        
        const activeSet = new Set((activeClientStages || []).map((s: any) => s.stage_id));
        stagesWithActiveClients = activeSet.size;
      } catch (e) {
        // Active client usage not available
      }

      return {
        totalStages: (stages || []).filter(s => !s.is_archived).length,
        certifiedStages: (stages || []).filter(s => s.is_certified && !s.is_archived).length,
        archivedStages: (stages || []).filter(s => s.is_archived).length,
        stagesInPackages: stagesInPackagesSet.size,
        stagesWithActiveClients
      };
    },
    staleTime: 30000
  });

  // Top stages by usage
  const { data: topStages, isLoading: topStagesLoading, refetch: refetchTopStages } = useQuery({
    queryKey: ['stage-analytics-top-stages', frameworkFilter, stageTypeFilter, certifiedFilter],
    queryFn: async (): Promise<TopStageByUsage[]> => {
      // Get all non-archived stages
      let query = supabase
        .from('documents_stages')
        .select('id, title, stage_type, is_certified, frameworks, updated_at')
        .eq('is_archived', false);

      if (stageTypeFilter) {
        query = query.eq('stage_type', stageTypeFilter);
      }
      if (certifiedFilter === 'certified') {
        query = query.eq('is_certified', true);
      } else if (certifiedFilter === 'uncertified') {
        query = query.eq('is_certified', false);
      }

      const { data: stages, error: stagesError } = await query;
      if (stagesError) throw stagesError;

      // Get package counts
      const { data: packageStages, error: psError } = await supabase
        .from('package_stages' as any)
        .select('stage_id, package_id') as any;
      
      if (psError) throw psError;

      // Count packages per stage
      const packageCountMap = new Map<number, Set<number>>();
      (packageStages || []).forEach((ps: any) => {
        if (!packageCountMap.has(ps.stage_id)) {
          packageCountMap.set(ps.stage_id, new Set());
        }
        packageCountMap.get(ps.stage_id)!.add(ps.package_id);
      });

      // Try to get active client counts
      let activeClientCountMap = new Map<number, number>();
      try {
        const { data: activeClientStages } = await supabase
          .from('client_package_stages')
          .select('stage_id, client_package:client_packages!inner(id, status)')
          .in('client_package.status', ['active', 'in_progress']) as any;
        
        const stageClientMap = new Map<number, Set<string>>();
        (activeClientStages || []).forEach((s: any) => {
          if (!stageClientMap.has(s.stage_id)) {
            stageClientMap.set(s.stage_id, new Set());
          }
          stageClientMap.get(s.stage_id)!.add(s.client_package?.id);
        });
        stageClientMap.forEach((clients, stageId) => {
          activeClientCountMap.set(stageId, clients.size);
        });
      } catch (e) {
        // Active client counts not available
      }

      let results = (stages || []).map(stage => ({
        id: stage.id,
        title: stage.title,
        stage_type: stage.stage_type,
        is_certified: stage.is_certified,
        frameworks: (stage as any).frameworks || null,
        packageCount: packageCountMap.get(stage.id)?.size || 0,
        activeClientCount: activeClientCountMap.get(stage.id) || 0,
        updated_at: stage.updated_at
      }));

      // Filter by framework if specified
      if (frameworkFilter) {
        results = results.filter(s => 
          s.frameworks && s.frameworks.includes(frameworkFilter)
        );
      }

      // Sort by package count desc
      results.sort((a, b) => b.packageCount - a.packageCount);

      return results.slice(0, 50);
    },
    staleTime: 30000
  });

  // Certified but unused stages
  const { data: certifiedUnused, isLoading: certifiedUnusedLoading, refetch: refetchCertifiedUnused } = useQuery({
    queryKey: ['stage-analytics-certified-unused'],
    queryFn: async (): Promise<CertifiedUnusedStage[]> => {
      // Get certified non-archived stages
      const { data: certifiedStages, error: stagesError } = await supabase
        .from('documents_stages')
        .select('id, title, version_label, updated_at')
        .eq('is_certified', true)
        .eq('is_archived', false);
      
      if (stagesError) throw stagesError;

      // Get package_stages
      const { data: packageStages, error: psError } = await supabase
        .from('package_stages' as any)
        .select('stage_id') as any;
      
      if (psError) throw psError;

      const usedStageIds = new Set((packageStages || []).map((ps: any) => ps.stage_id));

      // Filter to unused
      const unusedStages = (certifiedStages || []).filter(s => !usedStageIds.has(s.id));

      // Try to get certified_at from audit logs
      const stageIds = unusedStages.map(s => s.id.toString());
      let certifiedAtMap = new Map<string, string>();
      
      if (stageIds.length > 0) {
        const { data: auditEvents } = await supabase
          .from('audit_events')
          .select('entity_id, created_at')
          .eq('entity', 'stage')
          .eq('action', 'stage.certified')
          .in('entity_id', stageIds)
          .order('created_at', { ascending: false });
        
        (auditEvents || []).forEach(e => {
          if (!certifiedAtMap.has(e.entity_id)) {
            certifiedAtMap.set(e.entity_id, e.created_at);
          }
        });
      }

      return unusedStages.map(s => ({
        id: s.id,
        title: s.title,
        version_label: (s as any).version_label || null,
        certified_at: certifiedAtMap.get(s.id.toString()) || null,
        updated_at: s.updated_at
      }));
    },
    staleTime: 30000
  });

  // High-risk stages (edited while active)
  const { data: highRiskStages, isLoading: highRiskLoading, refetch: refetchHighRisk } = useQuery({
    queryKey: ['stage-analytics-high-risk', dateRangeDays],
    queryFn: async (): Promise<HighRiskStage[]> => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - dateRangeDays);

      // Get stages used by active clients
      let activeStageIds: number[] = [];
      let stageActiveClientCount = new Map<number, number>();
      
      try {
        const { data: activeClientStages } = await supabase
          .from('client_package_stages')
          .select('stage_id, client_package:client_packages!inner(id, status)')
          .in('client_package.status', ['active', 'in_progress']) as any;
        
        const stageClientMap = new Map<number, Set<string>>();
        (activeClientStages || []).forEach((s: any) => {
          if (!stageClientMap.has(s.stage_id)) {
            stageClientMap.set(s.stage_id, new Set());
          }
          stageClientMap.get(s.stage_id)!.add(s.client_package?.id);
        });
        
        activeStageIds = Array.from(stageClientMap.keys());
        stageClientMap.forEach((clients, stageId) => {
          stageActiveClientCount.set(stageId, clients.size);
        });
      } catch (e) {
        // Active client data not available
        return [];
      }

      if (activeStageIds.length === 0) return [];

      // Get recent edits from audit log
      const { data: auditEvents, error: auditError } = await supabase
        .from('audit_events')
        .select('entity_id, created_at, user_id, action')
        .eq('entity', 'stage')
        .gte('created_at', cutoffDate.toISOString())
        .in('entity_id', activeStageIds.map(String));
      
      if (auditError) throw auditError;

      // Also check package_builder_audit_log for stage-related edits
      const { data: builderAuditEvents } = await supabase
        .from('package_builder_audit_log' as any)
        .select('stage_id, created_at, user_id, action')
        .gte('created_at', cutoffDate.toISOString())
        .in('stage_id', activeStageIds) as any;

      // Aggregate edits per stage
      const stageEditData = new Map<number, { count: number; lastEdit: string | null; editors: Map<string, number> }>();

      (auditEvents || []).forEach(e => {
        const stageId = parseInt(e.entity_id);
        if (!stageEditData.has(stageId)) {
          stageEditData.set(stageId, { count: 0, lastEdit: null, editors: new Map() });
        }
        const data = stageEditData.get(stageId)!;
        data.count++;
        if (!data.lastEdit || e.created_at > data.lastEdit) {
          data.lastEdit = e.created_at;
        }
        if (e.user_id) {
          data.editors.set(e.user_id, (data.editors.get(e.user_id) || 0) + 1);
        }
      });

      (builderAuditEvents || []).forEach((e: any) => {
        const stageId = e.stage_id;
        if (!stageEditData.has(stageId)) {
          stageEditData.set(stageId, { count: 0, lastEdit: null, editors: new Map() });
        }
        const data = stageEditData.get(stageId)!;
        data.count++;
        if (!data.lastEdit || e.created_at > data.lastEdit) {
          data.lastEdit = e.created_at;
        }
        if (e.user_id) {
          data.editors.set(e.user_id, (data.editors.get(e.user_id) || 0) + 1);
        }
      });

      // Get stage titles
      const stageIdsWithEdits = Array.from(stageEditData.keys());
      if (stageIdsWithEdits.length === 0) return [];

      const { data: stages } = await supabase
        .from('documents_stages')
        .select('id, title')
        .in('id', stageIdsWithEdits);

      const stageTitleMap = new Map((stages || []).map(s => [s.id, s.title]));

      // Get user emails for top editors
      const allUserIds = new Set<string>();
      stageEditData.forEach(data => {
        data.editors.forEach((_, userId) => allUserIds.add(userId));
      });

      let userEmailMap = new Map<string, string>();
      if (allUserIds.size > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('user_uuid, email')
          .in('user_uuid', Array.from(allUserIds));
        
        (users || []).forEach(u => userEmailMap.set(u.user_uuid, u.email));
      }

      const results: HighRiskStage[] = [];
      stageEditData.forEach((data, stageId) => {
        // Find top editor
        let topEditor: string | null = null;
        let maxEdits = 0;
        data.editors.forEach((count, userId) => {
          if (count > maxEdits) {
            maxEdits = count;
            topEditor = userEmailMap.get(userId) || userId;
          }
        });

        results.push({
          id: stageId,
          title: stageTitleMap.get(stageId) || `Stage ${stageId}`,
          activeClientCount: stageActiveClientCount.get(stageId) || 0,
          editCount: data.count,
          lastEditDate: data.lastEdit,
          topEditor
        });
      });

      // Sort by edit count desc
      results.sort((a, b) => b.editCount - a.editCount);

      return results;
    },
    staleTime: 30000
  });

  // Stage change activity feed
  const { data: activityFeed, isLoading: activityLoading, refetch: refetchActivity } = useQuery({
    queryKey: ['stage-analytics-activity', dateRangeDays],
    queryFn: async (): Promise<StageAuditEvent[]> => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - dateRangeDays);

      const { data: events, error } = await supabase
        .from('audit_events')
        .select('id, created_at, action, entity_id, user_id, details')
        .eq('entity', 'stage')
        .gte('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;

      // Get stage titles
      const stageIds = [...new Set((events || []).map(e => parseInt(e.entity_id)))];
      let stageTitleMap = new Map<number, string>();
      if (stageIds.length > 0) {
        const { data: stages } = await supabase
          .from('documents_stages')
          .select('id, title')
          .in('id', stageIds);
        
        (stages || []).forEach(s => stageTitleMap.set(s.id, s.title));
      }

      // Get user emails
      const userIds = [...new Set((events || []).filter(e => e.user_id).map(e => e.user_id!))];
      let userEmailMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('user_uuid, email')
          .in('user_uuid', userIds);
        
        (users || []).forEach(u => userEmailMap.set(u.user_uuid, u.email));
      }

      return (events || []).map(e => ({
        id: e.id,
        created_at: e.created_at,
        action: e.action,
        entity_id: e.entity_id,
        stage_title: stageTitleMap.get(parseInt(e.entity_id)) || null,
        user_id: e.user_id,
        user_email: e.user_id ? userEmailMap.get(e.user_id) || null : null,
        details: e.details
      }));
    },
    staleTime: 30000
  });

  const refetchAll = useCallback(() => {
    refetchKpis();
    refetchTopStages();
    refetchCertifiedUnused();
    refetchHighRisk();
    refetchActivity();
  }, [refetchKpis, refetchTopStages, refetchCertifiedUnused, refetchHighRisk, refetchActivity]);

  return {
    kpis: kpis || {
      totalStages: 0,
      certifiedStages: 0,
      archivedStages: 0,
      stagesInPackages: 0,
      stagesWithActiveClients: 0
    },
    kpisLoading,
    topStages: topStages || [],
    topStagesLoading,
    certifiedUnused: certifiedUnused || [],
    certifiedUnusedLoading,
    highRiskStages: highRiskStages || [],
    highRiskLoading,
    activityFeed: activityFeed || [],
    activityLoading,
    refetchAll
  };
}

// CSV export helper
export function exportToCSV(data: any[], filename: string) {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        if (Array.isArray(val)) return `"${val.join('; ')}"`;
        return String(val);
      }).join(',')
    )
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
}
