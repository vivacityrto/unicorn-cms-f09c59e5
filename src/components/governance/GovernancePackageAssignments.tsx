import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package } from 'lucide-react';

interface Props {
  documentId: number;
}

interface PackageAssignment {
  package_id: number;
  package_name: string;
  stage_id: number;
  stage_title: string;
  delivery_type: string;
}

export function GovernancePackageAssignments({ documentId }: Props) {
  const { data: assignments, isLoading } = useQuery({
    queryKey: ['governance-package-assignments', documentId],
    queryFn: async () => {
      // 1. Get stages linked to this document
      const { data: stageDocs, error: sdError } = await supabase
        .from('stage_documents')
        .select('stage_id, delivery_type')
        .eq('document_id', documentId)
        .eq('is_active', true);
      if (sdError) throw sdError;
      if (!stageDocs || stageDocs.length === 0) return [] as PackageAssignment[];

      const stageIds = [...new Set(stageDocs.map(r => r.stage_id))];

      // 2. Get packages linked to those stages (may be empty)
      const { data: pkgStages } = await supabase
        .from('package_stages')
        .select('stage_id, package_id')
        .in('stage_id', stageIds);

      const pkgIds = [...new Set((pkgStages || []).map(r => r.package_id))];

      // 3. Fetch names — use documents_stages (correct FK target)
      const [pkgRes, stageRes] = await Promise.all([
        pkgIds.length > 0
          ? supabase.from('packages').select('id, name').in('id', pkgIds)
          : { data: [] },
        supabase.from('documents_stages').select('id, title').in('id', stageIds),
      ]);

      const pkgMap = new Map((pkgRes.data || []).map((p: any) => [p.id, p.name]));
      const stageMap = new Map((stageRes.data || []).map((s: any) => [s.id, s.title]));

      // 4. Build delivery_type lookup and package-per-stage lookup
      const deliveryMap = new Map(stageDocs.map(r => [r.stage_id, r.delivery_type]));
      const stagePkgMap = new Map<number, string[]>();
      for (const ps of (pkgStages || [])) {
        const list = stagePkgMap.get(ps.stage_id) || [];
        const name = pkgMap.get(ps.package_id) ?? 'Unknown';
        if (!list.includes(name)) list.push(name);
        stagePkgMap.set(ps.stage_id, list);
      }

      // 5. Build one entry per stage (packages may be empty)
      return stageIds.map((sid) => ({
        package_id: 0,
        package_name: (stagePkgMap.get(sid) || []).join(', ') || '',
        stage_id: sid,
        stage_title: stageMap.get(sid) ?? 'Unknown',
        delivery_type: deliveryMap.get(sid) ?? 'standard',
      })) as PackageAssignment[];
    },
    staleTime: 2 * 60_000,
  });

  // Group by stage (primary), with packages as secondary
  const grouped = (assignments || []).reduce<Record<number, { title: string; delivery_type: string; packages: string[] }>>((acc, a) => {
    if (!acc[a.stage_id]) {
      acc[a.stage_id] = { title: a.stage_title, delivery_type: a.delivery_type, packages: [] };
    }
    if (!acc[a.stage_id].packages.includes(a.package_name)) {
      acc[a.stage_id].packages.push(a.package_name);
    }
    return acc;
  }, {});

  const entries = Object.entries(grouped);

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
                  {stage.delivery_type !== 'standard' && (
                    <span className="ml-1 text-xs text-muted-foreground opacity-60">({stage.delivery_type})</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {stage.packages.map((pkg) => (
                    <Badge key={pkg} variant="outline" className="text-xs">{pkg}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
