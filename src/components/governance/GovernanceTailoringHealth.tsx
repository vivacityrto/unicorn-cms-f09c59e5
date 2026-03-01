import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, AlertTriangle, ShieldAlert } from 'lucide-react';

interface GovernanceTailoringHealthProps {
  documentId: number;
}

export function GovernanceTailoringHealth({ documentId }: GovernanceTailoringHealthProps) {
  const { data: stats } = useQuery({
    queryKey: ['governance-tailoring-health', documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('governance_document_deliveries')
        .select('tailoring_risk_level')
        .eq('document_id', documentId)
        .eq('status', 'success');

      if (error) throw error;
      if (!data?.length) return null;

      const counts = { complete: 0, partial: 0, incomplete: 0 };
      for (const row of data) {
        const level = row.tailoring_risk_level as keyof typeof counts;
        if (level && counts[level] !== undefined) {
          counts[level]++;
        }
      }
      return counts;
    },
  });

  const { data: requiredFields } = useQuery({
    queryKey: ['governance-required-fields', documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_fields')
        .select('field:dd_fields(tag, name)')
        .eq('document_id', documentId);
      if (error) throw error;
      return (data || []).map((r: any) => r.field).filter(Boolean) as { tag: string; name: string }[];
    },
  });

  if (!stats && (!requiredFields || requiredFields.length === 0)) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Tailoring Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {stats && (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span className="font-medium">{stats.complete}</span>
              <span className="text-muted-foreground">Fully Tailored</span>
            </div>
            {stats.partial > 0 && (
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="font-medium">{stats.partial}</span>
                <span className="text-muted-foreground">Partial</span>
              </div>
            )}
            {stats.incomplete > 0 && (
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4 text-destructive" />
                <span className="font-medium">{stats.incomplete}</span>
                <span className="text-muted-foreground">Incomplete</span>
              </div>
            )}
          </div>
        )}

        {requiredFields && requiredFields.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Required Fields ({requiredFields.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {requiredFields.map((f) => (
                <Badge key={f.tag} variant="outline" className="font-mono text-xs">
                  {`{{${f.tag}}}`}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
