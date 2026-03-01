import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ExternalLink, Send, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

interface GovernanceDeliveryHistoryProps {
  documentId: number;
}

export function GovernanceDeliveryHistory({ documentId }: GovernanceDeliveryHistoryProps) {
  const { data: deliveries, isLoading } = useQuery({
    queryKey: ['governance-delivery-history', documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('governance_document_deliveries')
        .select('*')
        .eq('document_id', documentId)
        .order('delivered_at', { ascending: false });

      if (error) throw error;
      if (!data?.length) return [];

      // Enrich with tenant names
      const tenantIds = [...new Set(data.map((d) => d.tenant_id))];
      const { data: tenants } = await supabase
        .from('tenants')
        .select('id, name')
        .in('id', tenantIds);
      const tenantMap = new Map(tenants?.map((t) => [t.id, t.name]) || []);

      // Enrich with version numbers
      const versionIds = [...new Set(data.map((d) => d.document_version_id))];
      const { data: versions } = await supabase
        .from('document_versions')
        .select('id, version_number')
        .in('id', versionIds);
      const versionMap = new Map(versions?.map((v) => [v.id, v.version_number]) || []);

      // Enrich with user names
      const userIds = [...new Set(data.map((d) => d.delivered_by).filter(Boolean))] as string[];
      const { data: users } = userIds.length
        ? await supabase.from('users').select('user_uuid, full_name').in('user_uuid', userIds)
        : { data: [] as { user_uuid: string; full_name: string }[] };
      const userMap = new Map((users || []).map((u) => [u.user_uuid, u.full_name] as const));

      // Enrich with snapshot dates
      const snapshotIds = [...new Set(data.map((d) => d.snapshot_id).filter(Boolean))] as string[];
      const { data: snapshots } = snapshotIds.length
        ? await supabase.from('tga_rto_snapshots').select('id, created_at').in('id', snapshotIds)
        : { data: [] as { id: string; created_at: string }[] };
      const snapshotMap = new Map((snapshots || []).map((s) => [s.id, s.created_at] as const));

      return data.map((d) => ({
        ...d,
        tenant_name: tenantMap.get(d.tenant_id) || `Tenant ${d.tenant_id}`,
        version_number: versionMap.get(d.document_version_id) ?? '?',
        delivered_by_name: d.delivered_by ? userMap.get(d.delivered_by) || '—' : '—',
        snapshot_date: d.snapshot_id ? snapshotMap.get(d.snapshot_id) || null : null,
      }));
    },
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-emerald-600 text-primary-foreground">Success</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const tailoringBadge = (riskLevel: string | null) => {
    if (!riskLevel) return <span className="text-xs text-muted-foreground">—</span>;
    switch (riskLevel) {
      case 'complete':
        return <Badge className="bg-emerald-600 text-primary-foreground text-xs">Complete</Badge>;
      case 'partial':
        return <Badge className="bg-amber-500 text-primary-foreground text-xs">Partial</Badge>;
      case 'incomplete':
        return <Badge variant="destructive" className="text-xs">Incomplete</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{riskLevel}</Badge>;
    }
  };

  const issuesPopover = (d: any) => {
    const missing = (d.missing_merge_fields as string[] | null) || [];
    const invalid = (d.invalid_merge_fields as string[] | null) || [];
    const total = missing.length + invalid.length;
    if (total === 0) return <span className="text-xs text-muted-foreground">—</span>;

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1">
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            {total}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64">
          {missing.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-medium mb-1">Missing Fields ({missing.length})</p>
              <div className="flex flex-wrap gap-1">
                {missing.map((f) => (
                  <Badge key={f} variant="outline" className="text-xs font-mono">{`{{${f}}}`}</Badge>
                ))}
              </div>
            </div>
          )}
          {invalid.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-1">Invalid Tags ({invalid.length})</p>
              <div className="flex flex-wrap gap-1">
                {invalid.map((f) => (
                  <Badge key={f} variant="destructive" className="text-xs font-mono">{`{{${f}}}`}</Badge>
                ))}
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    );
  };

  if (isLoading) return null;
  if (!deliveries?.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Send className="h-4 w-4" /> Delivery History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tenant</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tailoring</TableHead>
              <TableHead>Issues</TableHead>
              <TableHead>Delivered By</TableHead>
              <TableHead>Delivered At</TableHead>
              <TableHead>Snapshot</TableHead>
              <TableHead>SharePoint</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium text-sm">{d.tenant_name}</TableCell>
                <TableCell className="text-sm">v{String(d.version_number)}</TableCell>
                <TableCell>{statusBadge(d.status)}</TableCell>
                <TableCell>{tailoringBadge(d.tailoring_risk_level)}</TableCell>
                <TableCell>{issuesPopover(d)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.delivered_by_name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {d.delivered_at ? format(new Date(d.delivered_at), 'dd MMM yyyy HH:mm') : '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {d.snapshot_date ? format(new Date(d.snapshot_date), 'dd MMM yyyy') : 'N/A'}
                </TableCell>
                <TableCell>
                  {d.sharepoint_web_url ? (
                    <Button variant="ghost" size="sm" asChild>
                      <a href={d.sharepoint_web_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
