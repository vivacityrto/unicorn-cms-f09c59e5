import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Send } from 'lucide-react';
import { format } from 'date-fns';

interface Version {
  id: string;
  version_number: number;
  status: string;
  file_name: string;
  checksum_sha256: string | null;
  created_at: string;
  published_at: string | null;
}

interface GovernanceVersionHistoryProps {
  versions: Version[] | null | undefined;
  onPublish: (versionId: string) => void;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'published':
      return <Badge variant="default" className="bg-emerald-600">Published</Badge>;
    case 'draft':
      return <Badge variant="secondary">Draft</Badge>;
    case 'archived':
      return <Badge variant="outline">Archived</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function GovernanceVersionHistory({ versions, onPublish }: GovernanceVersionHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Version History</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Checksum</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Published</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!versions?.length ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-4 text-muted-foreground">
                  No versions yet
                </TableCell>
              </TableRow>
            ) : (
              versions.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono">v{v.version_number}</TableCell>
                  <TableCell>{getStatusBadge(v.status)}</TableCell>
                  <TableCell className="text-sm">{v.file_name}</TableCell>
                  <TableCell>
                    {v.checksum_sha256 ? (
                      <span className="text-xs font-mono text-muted-foreground" title={v.checksum_sha256}>
                        {v.checksum_sha256.slice(0, 12)}…
                      </span>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(v.created_at), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {v.published_at ? format(new Date(v.published_at), 'dd MMM yyyy') : '—'}
                  </TableCell>
                  <TableCell>
                    {v.status === 'draft' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPublish(v.id)}
                      >
                        <Send className="h-3 w-3 mr-1" /> Publish
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
