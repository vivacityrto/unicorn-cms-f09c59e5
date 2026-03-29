import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PackageSyncStatus {
  packageInstanceId: number;
  packageName: string;
  tenantName: string;
  stageInstanceId: number;
  templateDocCount: number;
  instanceDocCount: number;
  extraDocIds: number[];
  missingDocIds: number[];
  extraCount: number;
  missingCount: number;
  inSync: boolean;
}

export interface DocumentSyncAuditResult {
  templateDocCount: number;
  packages: PackageSyncStatus[];
  totalInSync: number;
  totalPackages: number;
}

async function batchedQueries<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

export function useDocumentSyncAudit(stageId: number | null) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['document-sync-audit', stageId],
    queryFn: async (): Promise<DocumentSyncAuditResult> => {
      if (!stageId) return { templateDocCount: 0, packages: [], totalInSync: 0, totalPackages: 0 };

      // 1. Template docs (authoritative source)
      const { data: templateDocs, error: tdErr } = await supabase
        .from('documents')
        .select('id')
        .eq('stage', stageId);
      if (tdErr) throw tdErr;
      const templateDocIds = new Set((templateDocs || []).map(t => t.id));

      // 2. Stage instances for this stage
      const { data: stageInstances, error: siErr } = await supabase
        .from('stage_instances')
        .select('id, stage_id, packageinstance_id')
        .eq('stage_id', stageId);
      if (siErr) throw siErr;
      if (!stageInstances?.length) {
        return { templateDocCount: templateDocIds.size, packages: [], totalInSync: 0, totalPackages: 0 };
      }

      // 3. Active package instances (not complete)
      const piIds = [...new Set(stageInstances.map(si => si.packageinstance_id))];
      const { data: packageInstances } = await supabase
        .from('package_instances')
        .select('id, tenant_id, package_id, is_complete')
        .in('id', piIds)
        .eq('is_complete', false);
      if (!packageInstances?.length) {
        return { templateDocCount: templateDocIds.size, packages: [], totalInSync: 0, totalPackages: 0 };
      }

      const activePiIds = new Set(packageInstances.map(pi => pi.id));
      const activeStageInstances = stageInstances.filter(si => activePiIds.has(si.packageinstance_id));

      // 4. Package names & tenant names
      const pkgIds = [...new Set(packageInstances.map(pi => pi.package_id))];
      const tenantIds = [...new Set(packageInstances.map(pi => pi.tenant_id))];

      const [{ data: packages }, { data: tenants }] = await Promise.all([
        supabase.from('packages').select('id, name').in('id', pkgIds),
        supabase.from('tenants').select('id, name').in('id', tenantIds),
      ]);
      const pkgMap = new Map((packages || []).map(p => [p.id, p.name || 'Unnamed Package']));
      const tenantMap = new Map((tenants || []).map(t => [t.id, t.name]));

      // 5. Per-stage-instance document queries (avoids 1000-row limit)
      const piMap = new Map(packageInstances.map(pi => [pi.id, pi]));

      const perSiResults = await batchedQueries(activeStageInstances, 10, async (si) => {
        const { data: docs } = await supabase
          .from('document_instances')
          .select('document_id')
          .eq('stageinstance_id', si.id);
        
        const instanceDocIds = new Set((docs || []).map(d => d.document_id));
        const missingDocIds = [...templateDocIds].filter(id => !instanceDocIds.has(id));
        const extraDocIds = [...instanceDocIds].filter(id => !templateDocIds.has(id));
        const missingCount = missingDocIds.length;
        const extraCount = extraDocIds.length;

        const pi = piMap.get(si.packageinstance_id)!;
        return {
          packageInstanceId: pi.id,
          packageName: pkgMap.get(pi.package_id) || 'Unknown Package',
          tenantName: tenantMap.get(pi.tenant_id) || 'Unknown Client',
          stageInstanceId: si.id,
          templateDocCount: templateDocIds.size,
          instanceDocCount: instanceDocIds.size,
          extraDocIds,
          missingDocIds,
          extraCount,
          missingCount,
          inSync: missingCount === 0 && extraCount === 0,
        } satisfies PackageSyncStatus;
      });

      return {
        templateDocCount: templateDocIds.size,
        packages: perSiResults,
        totalInSync: perSiResults.filter(p => p.inSync).length,
        totalPackages: perSiResults.length,
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
