import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Bug, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface LegacyDiagnosticsProps {
  tenantId: number;
  packageId: number;
  stageInstanceIds: number[];
}

interface DiagResult {
  table: string;
  count: number;
  joinPath: string;
  status: 'ok' | 'empty' | 'error';
  detail?: string;
}

export function LegacyDataDiagnostics({ tenantId, packageId, stageInstanceIds }: LegacyDiagnosticsProps) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<DiagResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Only show for SuperAdmin / Vivacity team
  const isSuperAdmin = profile?.unicorn_role === 'Super Admin' || profile?.global_role === 'SuperAdmin';

  useEffect(() => {
    if (open && results.length === 0 && isSuperAdmin) {
      runDiagnostics();
    }
  }, [open]);

  if (!isSuperAdmin) return null;

  const runDiagnostics = async () => {
    setLoading(true);
    const diags: DiagResult[] = [];

    try {
      if (stageInstanceIds.length > 0) {
        const { count, error } = await supabase
          .from('document_instances')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .in('stageinstance_id', stageInstanceIds);

        diags.push({
          table: 'document_instances',
          count: count || 0,
          joinPath: 'stage_instances → document_instances.stageinstance_id + tenant_id',
          status: error ? 'error' : (count || 0) > 0 ? 'ok' : 'empty',
          detail: error?.message,
        });

        const { count: emailCount, error: emailErr } = await supabase
          .from('email_instances')
          .select('id', { count: 'exact', head: true })
          .in('stageinstance_id', stageInstanceIds);

        diags.push({
          table: 'email_instances',
          count: emailCount || 0,
          joinPath: 'stage_instances → email_instances.stageinstance_id',
          status: emailErr ? 'error' : (emailCount || 0) > 0 ? 'ok' : 'empty',
          detail: emailErr?.message,
        });
      }

      const { count: notesCount, error: notesErr } = await supabase
        .from('notes')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      diags.push({
        table: 'notes',
        count: notesCount || 0,
        joinPath: 'Direct tenant_id match',
        status: notesErr ? 'error' : (notesCount || 0) > 0 ? 'ok' : 'empty',
        detail: notesErr?.message,
      });

    } catch (err: any) {
      diags.push({ table: 'diagnostics', count: 0, joinPath: 'N/A', status: 'error', detail: err.message });
    }

    setResults(diags);
    setLoading(false);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-4">
      <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors px-1">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Bug className="h-3 w-3" />
        Legacy Data Diagnostics
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 rounded-md border bg-muted/30 p-3 space-y-2">
          {loading ? (
            <p className="text-xs text-muted-foreground">Running diagnostics…</p>
          ) : (
            results.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {r.status === 'ok' ? (
                    <CheckCircle2 className="h-3 w-3 text-primary" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-destructive" />
                  )}
                  <code className="font-mono">{r.table}</code>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={r.count > 0 ? 'default' : 'secondary'} className="text-xs">
                    {r.count} rows
                  </Badge>
                  <span className="text-muted-foreground max-w-[300px] truncate" title={r.joinPath}>
                    {r.joinPath}
                  </span>
                </div>
              </div>
            ))
          )}
          {results.some(r => r.status === 'empty') && (
            <p className="text-xs text-destructive mt-2">
              ⚠ Empty tables may indicate unmapped legacy data or RLS filtering.
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
