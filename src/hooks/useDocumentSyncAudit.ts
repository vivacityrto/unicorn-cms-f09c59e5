import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PackageSyncStatus {
  packageInstanceId: number;
  packageName: string;
  tenantName: string;
  stageInstanceId: number;
  templateDocCount: number;
  instanceDocCount: number;
  missingDocs: Array<{ id: number; title: string; category: string | null }>;
  orphanedInstances: Array<{ instanceId: number; documentId: number; title: string }>;
  inSync: boolean;
}

export interface DocumentSyncAuditResult {
  templateDocCount: number;
  packages: PackageSyncStatus[];
  totalInSync: number;
  totalPackages: number;
}

export function useDocumentSyncAudit(stageId: number | null) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['document-sync-audit', stageId],
    queryFn: async (): Promise<DocumentSyncAuditResult> => {
      if (!stageId) return { templateDocCount: 0, packages: [], totalInSync: 0, totalPackages: 0 };

      // 1. Get template docs (authoritative source)
      const { data: templateDocs, error: tdErr } = await supabase
        .from('documents')
        .select('id, title, category')
        .eq('stage', stageId);

      if (tdErr) throw tdErr;
      const templates = templateDocs || [];

      // 2. Get active stage_instances for this stage
      const { data: stageInstances, error: siErr } = await supabase
        .from('stage_instances')
        .select(`
          id,
          package_instance_id,
          package_instances!inner (
            id,
            is_complete,
            tenant_id,
            client_packages!inner (
              id,
              name
            )
          )
        `)
        .eq('stage_id', stageId)
        .eq('package_instances.is_complete', false);

      if (siErr) throw siErr;
      if (!stageInstances || stageInstances.length === 0) {
        return { templateDocCount: templates.length, packages: [], totalInSync: 0, totalPackages: 0 };
      }

      // 3. Get tenant names for display
      const tenantIds = [...new Set(
        stageInstances.map((si: any) => si.package_instances?.tenant_id).filter(Boolean)
      )];
      
      const { data: tenants } = await supabase
        .from('tenants')
        .select('id, name')
        .in('id', tenantIds);
      
      const tenantMap = new Map((tenants || []).map((t: any) => [t.id, t.name]));

      // 4. For each stage_instance, get document_instances
      const stageInstanceIds = stageInstances.map((si: any) => si.id);
      const { data: docInstances, error: diErr } = await supabase
        .from('document_instances')
        .select('id, document_id, stageinstance_id')
        .in('stageinstance_id', stageInstanceIds);

      if (diErr) throw diErr;

      // Get doc titles for orphaned instances
      const instanceDocIds = [...new Set((docInstances || []).map((di: any) => di.document_id))];
      const { data: instanceDocMeta } = instanceDocIds.length > 0
        ? await supabase.from('documents').select('id, title').in('id', instanceDocIds)
        : { data: [] };
      const docTitleMap = new Map((instanceDocMeta || []).map((d: any) => [d.id, d.title]));

      // 5. Build per-package comparison
      const templateDocIds = new Set(templates.map(t => t.id));
      
      const packages: PackageSyncStatus[] = stageInstances.map((si: any) => {
        const pi = si.package_instances;
        const cp = pi?.client_packages;
        const siDocInstances = (docInstances || []).filter((di: any) => di.stageinstance_id === si.id);
        const instanceDocIdSet = new Set(siDocInstances.map((di: any) => di.document_id));

        const missingDocs = templates
          .filter(t => !instanceDocIdSet.has(t.id))
          .map(t => ({ id: t.id, title: t.title, category: t.category }));

        const orphanedInstances = siDocInstances
          .filter((di: any) => !templateDocIds.has(di.document_id))
          .map((di: any) => ({
            instanceId: di.id,
            documentId: di.document_id,
            title: docTitleMap.get(di.document_id) || `Document #${di.document_id}`,
          }));

        return {
          packageInstanceId: pi?.id,
          packageName: cp?.name || 'Unknown Package',
          tenantName: tenantMap.get(pi?.tenant_id) || 'Unknown Client',
          stageInstanceId: si.id,
          templateDocCount: templates.length,
          instanceDocCount: siDocInstances.length,
          missingDocs,
          orphanedInstances,
          inSync: missingDocs.length === 0 && orphanedInstances.length === 0,
        };
      });

      return {
        templateDocCount: templates.length,
        packages,
        totalInSync: packages.filter(p => p.inSync).length,
        totalPackages: packages.length,
      };
    },
    enabled: !!stageId,
  });

  return {
    audit: data || null,
    isLoading,
    refetch,
  };
}
