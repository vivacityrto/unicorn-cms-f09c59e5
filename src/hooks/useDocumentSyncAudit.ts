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

      // 1. Template docs (authoritative source)
      const { data: templateDocs, error: tdErr } = await supabase
        .from('documents')
        .select('id, title, category')
        .eq('stage', stageId);
      if (tdErr) throw tdErr;
      const templates = templateDocs || [];

      // 2. Stage instances for this stage
      const { data: stageInstances, error: siErr } = await supabase
        .from('stage_instances')
        .select('id, stage_id, packageinstance_id')
        .eq('stage_id', stageId);
      if (siErr) throw siErr;
      if (!stageInstances?.length) {
        return { templateDocCount: templates.length, packages: [], totalInSync: 0, totalPackages: 0 };
      }

      // 3. Active package instances (not complete)
      const piIds = [...new Set(stageInstances.map(si => si.packageinstance_id))];
      const { data: packageInstances } = await supabase
        .from('package_instances')
        .select('id, tenant_id, package_id, is_complete')
        .in('id', piIds)
        .eq('is_complete', false);
      if (!packageInstances?.length) {
        return { templateDocCount: templates.length, packages: [], totalInSync: 0, totalPackages: 0 };
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

      // 5. Document instances for active stage instances
      const siIds = activeStageInstances.map(si => si.id);
      const { data: docInstances, error: diErr } = await supabase
        .from('document_instances')
        .select('id, document_id, stageinstance_id')
        .in('stageinstance_id', siIds);
      if (diErr) throw diErr;

      // Get titles for orphaned docs
      const allDocIds = [...new Set((docInstances || []).map(di => di.document_id))];
      const { data: docMeta } = allDocIds.length > 0
        ? await supabase.from('documents').select('id, title').in('id', allDocIds)
        : { data: [] as { id: number; title: string }[] };
      const docTitleMap = new Map((docMeta || []).map(d => [d.id, d.title]));

      // 6. Build per-package comparison
      const templateDocIds = new Set(templates.map(t => t.id));
      const piMap = new Map(packageInstances.map(pi => [pi.id, pi]));

      const result: PackageSyncStatus[] = activeStageInstances.map(si => {
        const pi = piMap.get(si.packageinstance_id)!;
        const siDocs = (docInstances || []).filter(di => di.stageinstance_id === si.id);
        const instanceDocIdSet = new Set(siDocs.map(di => di.document_id));

        const missingDocs = templates
          .filter(t => !instanceDocIdSet.has(t.id))
          .map(t => ({ id: t.id, title: t.title, category: t.category }));

        const orphanedInstances = siDocs
          .filter(di => !templateDocIds.has(di.document_id))
          .map(di => ({
            instanceId: di.id,
            documentId: di.document_id,
            title: docTitleMap.get(di.document_id) || `Document #${di.document_id}`,
          }));

        return {
          packageInstanceId: pi.id,
          packageName: pkgMap.get(pi.package_id) || 'Unknown Package',
          tenantName: tenantMap.get(pi.tenant_id) || 'Unknown Client',
          stageInstanceId: si.id,
          templateDocCount: templates.length,
          instanceDocCount: siDocs.length,
          missingDocs,
          orphanedInstances,
          inSync: missingDocs.length === 0 && orphanedInstances.length === 0,
        };
      });

      return {
        templateDocCount: templates.length,
        packages: result,
        totalInSync: result.filter(p => p.inSync).length,
        totalPackages: result.length,
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
