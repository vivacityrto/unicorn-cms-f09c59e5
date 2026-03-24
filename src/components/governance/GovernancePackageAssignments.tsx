import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package } from 'lucide-react';

interface Props {
  documentId: number;
}

export function GovernancePackageAssignments({ documentId }: Props) {
  const { data: grouped, isLoading } = useQuery({
    queryKey: ['governance-package-assignments', documentId],
    queryFn: async () => {
      // 1. Get document_instances for this document
      const { data: docInstances, error: diErr } = await supabase
        .from('document_instances')
        .select('stageinstance_id')
        .eq('document_id', documentId);
      if (diErr) throw diErr;
      if (!docInstances || docInstances.length === 0) return {};

      const stageInstanceIds = [...new Set(docInstances.map(r => r.stageinstance_id).filter(Boolean))];
      if (stageInstanceIds.length === 0) return {};

      // 2. Get stage_instances → stage_id + packageinstance_id
      const { data: stageInsts, error: siErr } = await supabase
        .from('stage_instances')
        .select('id, stage_id, packageinstance_id')
        .in('id', stageInstanceIds);
      if (siErr) throw siErr;
      if (!stageInsts || stageInsts.length === 0) return {};

      const stageIds = [...new Set(stageInsts.map(r => r.stage_id).filter(Boolean))];
      const pkgInstanceIds = [...new Set(stageInsts.map(r => r.packageinstance_id).filter(Boolean))];

      // 3. Fetch stage names and package_instances → package_id
      const [stagesRes, pkgInstRes] = await Promise.all([
        stageIds.length > 0
          ? supabase.from('stages').select('id, name').in('id', stageIds)
          : { data: [], error: null },
        pkgInstanceIds.length > 0
          ? supabase.from('package_instances').select('id, package_id').in('id', pkgInstanceIds)
          : { data: [], error: null },
      ]);

      const stageMap = new Map((stagesRes.data || []).map((s: any) => [s.id, s.name]));
      const pkgInstMap = new Map((pkgInstRes.data || []).map((p: any) => [p.id, p.package_id]));

      // 4. Fetch package names
      const pkgIds = [...new Set([...(pkgInstRes.data || []).map((p: any) => p.package_id)].filter(Boolean))];
      const pkgRes = pkgIds.length > 0
        ? await supabase.from('packages').select('id, name').in('id', pkgIds)
        : { data: [] };
      const pkgMap = new Map((pkgRes.data || []).map((p: any) => [p.id, p.name]));

      // 5. Build grouped: stage → packages (deduplicated)
      const result: Record<number, { title: string; packages: string[] }> = {};
      for (const si of stageInsts) {
        const sid = si.stage_id;
        if (!sid) continue;
        const stageName = stageMap.get(sid) ?? 'Unknown';
        if (!result[sid]) {
          result[sid] = { title: stageName, packages: [] };
        }
        const pkgInstId = si.packageinstance_id;
        if (pkgInstId) {
          const pkgId = pkgInstMap.get(pkgInstId);
          const pkgName = pkgId ? pkgMap.get(pkgId) : null;
          if (pkgName && !result[sid].packages.includes(pkgName)) {
            result[sid].packages.push(pkgName);
          }
        }
      }
      return result;
    },
    staleTime: 2 * 60_000,
  });

  const entries = Object.entries(grouped || {});

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="h-4 w-4" /> Stage & Package Assignments
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">This document has not been assigned to any stages or packages.</p>
        ) : (
          <div className="space-y-3">
            {entries.map(([stageId, stage]) => (
              <div key={stageId} className="flex items-start gap-3">
                <div className="shrink-0">
                  <span className="text-sm font-medium">{stage.title}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {stage.packages.length > 0 ? stage.packages.map((pkg) => (
                    <Badge key={pkg} variant="outline" className="text-xs">{pkg}</Badge>
                  )) : (
                    <span className="text-xs text-muted-foreground italic">No packages linked</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
