import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { ExternalLink, Send } from 'lucide-react';
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

      return data.map((d) => ({
        ...d,
        tenant_name: tenantMap.get(d.tenant_id) || `Tenant ${d.tenant_id}`,
        version_number: versionMap.get(d.document_version_id) ?? '?',
        delivered_by_name: d.delivered_by ? userMap.get(d.delivered_by) || '—' : '—',
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
              <TableHead>Delivered By</TableHead>
              <TableHead>Delivered At</TableHead>
              <TableHead>SharePoint</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium text-sm">{d.tenant_name}</TableCell>
                <TableCell className="text-sm">v{String(d.version_number)}</TableCell>
                <TableCell>{statusBadge(d.status)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.delivered_by_name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {d.delivered_at ? format(new Date(d.delivered_at), 'dd MMM yyyy HH:mm') : '—'}
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
