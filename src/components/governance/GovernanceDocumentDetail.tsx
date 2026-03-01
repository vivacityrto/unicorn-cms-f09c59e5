import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, ExternalLink, Upload, Send, FileText, Clock, Shield } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { GovernancePublishDialog } from './GovernancePublishDialog';

interface GovernanceDocumentDetailProps {
  documentId: number;
  onBack: () => void;
}

export function GovernanceDocumentDetail({ documentId, onBack }: GovernanceDocumentDetailProps) {
  const queryClient = useQueryClient();
  const [publishVersionId, setPublishVersionId] = useState<string | null>(null);

  const { data: doc, isLoading } = useQuery({
    queryKey: ['governance-doc-detail', documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select(`
          id, title, description, format, document_category, document_status,
          source_template_url, merge_fields, updated_at, current_published_version_id
        `)
        .eq('id', documentId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: versions } = useQuery({
    queryKey: ['governance-doc-versions', documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_versions')
        .select('*')
        .eq('document_id', documentId)
        .order('version_number', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const getStatusBadge = (status: string) => {
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
  };

  if (isLoading || !doc) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={onBack} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-bold">{doc.title}</h1>
            <p className="text-sm text-muted-foreground">
              {doc.document_category || 'Uncategorised'} • {doc.format || 'Unknown format'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {doc.source_template_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={doc.source_template_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" /> View Source
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Document Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" /> Document Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {getStatusBadge(doc.document_status)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" /> Last Updated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-sm">
              {doc.updated_at ? format(new Date(doc.updated_at), 'dd MMM yyyy HH:mm') : '—'}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" /> Published Version
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-sm">
              {doc.current_published_version_id
                ? `v${versions?.find(v => v.id === doc.current_published_version_id)?.version_number || '?'}`
                : 'None'}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Description */}
      {doc.description && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{doc.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Merge Fields */}
      {doc.merge_fields && Object.keys(doc.merge_fields as Record<string, unknown>).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Merge Fields</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.keys(doc.merge_fields as Record<string, unknown>).map((field) => (
                <Badge key={field} variant="outline" className="font-mono text-xs">
                  {`{{${field}}}`}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Version History */}
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
                versions.map((v: any) => (
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
                          onClick={() => setPublishVersionId(v.id)}
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

      {publishVersionId && (
        <GovernancePublishDialog
          versionId={publishVersionId}
          open={!!publishVersionId}
          onOpenChange={(open) => { if (!open) setPublishVersionId(null); }}
          onSuccess={() => {
            setPublishVersionId(null);
            queryClient.invalidateQueries({ queryKey: ['governance-doc-detail', documentId] });
            queryClient.invalidateQueries({ queryKey: ['governance-doc-versions', documentId] });
          }}
        />
      )}
    </div>
  );
}
