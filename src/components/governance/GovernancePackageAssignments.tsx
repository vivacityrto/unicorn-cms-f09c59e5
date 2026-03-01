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
  stage_title: string;
  delivery_type: string;
}

export function GovernancePackageAssignments({ documentId }: Props) {
  const { data: assignments, isLoading } = useQuery({
    queryKey: ['governance-package-assignments', documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('package_stage_documents')
        .select('package_id, delivery_type, stage_id')
        .eq('document_id', documentId)
        .eq('is_deleted', false)
        .order('package_id');
      if (error) throw error;
      if (!data || data.length === 0) return [] as PackageAssignment[];

      const pkgIds = [...new Set(data.map(r => r.package_id))];
      const stageIds = [...new Set(data.map(r => r.stage_id))];

      const [pkgRes, stageRes] = await Promise.all([
        supabase.from('packages').select('id, name').in('id', pkgIds),
        supabase.from('documents_stages').select('id, title').in('id', stageIds),
      ]);

      const pkgMap = new Map((pkgRes.data || []).map((p: any) => [p.id, p.name]));
      const stageMap = new Map((stageRes.data || []).map((s: any) => [s.id, s.title]));

      return data.map((row) => ({
        package_id: row.package_id,
        package_name: pkgMap.get(row.package_id) ?? 'Unknown',
        stage_title: stageMap.get(row.stage_id) ?? 'Unknown',
        delivery_type: row.delivery_type,
      })) as PackageAssignment[];
    },
    staleTime: 2 * 60_000,
  });

  // Group by package
  const grouped = (assignments || []).reduce<Record<number, { name: string; stages: { title: string; delivery_type: string }[] }>>((acc, a) => {
    if (!acc[a.package_id]) {
      acc[a.package_id] = { name: a.package_name, stages: [] };
    }
    acc[a.package_id].stages.push({ title: a.stage_title, delivery_type: a.delivery_type });
    return acc;
  }, {});

  const entries = Object.entries(grouped);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="h-4 w-4" /> Package Assignments
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">This document has not been assigned to any packages.</p>
        ) : (
          <div className="space-y-3">
            {entries.map(([pkgId, pkg]) => (
              <div key={pkgId} className="flex items-start gap-3">
                <Badge variant="outline" className="shrink-0 mt-0.5">{pkg.name}</Badge>
                <div className="flex flex-wrap gap-1.5">
                  {pkg.stages.map((s, i) => (
                    <span key={i} className="text-xs text-muted-foreground">
                      {s.title}
                      {s.delivery_type !== 'standard' && (
                        <span className="ml-1 text-xs opacity-60">({s.delivery_type})</span>
                      )}
                      {i < pkg.stages.length - 1 && ', '}
                    </span>
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
