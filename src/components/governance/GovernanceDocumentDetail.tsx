import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, ExternalLink, Upload, FileText, Clock, Shield, Send } from 'lucide-react';
import { format } from 'date-fns';
import { GovernanceVersionHistory } from './GovernanceVersionHistory';
import { GovernancePublishDialog } from './GovernancePublishDialog';
import { GovernanceImportDialog } from './GovernanceImportDialog';
import { GovernanceMappingEditor } from './GovernanceMappingEditor';
import { GovernanceDeliveryDialog } from './GovernanceDeliveryDialog';
import { GovernanceDeliveryHistory } from './GovernanceDeliveryHistory';
import { GovernanceTailoringHealth } from './GovernanceTailoringHealth';

interface GovernanceDocumentDetailProps {
  documentId: number;
  onBack: () => void;
}

export function GovernanceDocumentDetail({ documentId, onBack }: GovernanceDocumentDetailProps) {
  const queryClient = useQueryClient();
  const [publishVersionId, setPublishVersionId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [mappingVersionId, setMappingVersionId] = useState<string | null>(null);
  const [showDelivery, setShowDelivery] = useState(false);

  const { data: doc, isLoading } = useQuery({
    queryKey: ['governance-doc-detail', documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select(`
          id, title, description, format, document_category, document_status,
          source_template_url, updated_at, current_published_version_id
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
        return <Badge className="bg-emerald-600 text-primary-foreground">Published</Badge>;
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      case 'archived':
        return <Badge variant="outline">Archived</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Find latest draft version for mapping editor
  const latestDraft = versions?.find(v => v.status === 'draft');
  // Find published version for delivery
  const publishedVersion = versions?.find(v => v.id === doc?.current_published_version_id);

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

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['governance-doc-detail', documentId] });
    queryClient.invalidateQueries({ queryKey: ['governance-doc-versions', documentId] });
    queryClient.invalidateQueries({ queryKey: ['governance-delivery-history', documentId] });
    queryClient.invalidateQueries({ queryKey: ['governance-tailoring-health', documentId] });
  };

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
          {publishedVersion && (
            <Button variant="default" size="sm" onClick={() => setShowDelivery(true)}>
              <Send className="h-4 w-4 mr-2" /> Deliver to Clients
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4 mr-2" /> Import from SharePoint
          </Button>
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

      {/* Tailoring Health */}
      <GovernanceTailoringHealth documentId={documentId} />

      {/* Mapping Editor for latest draft */}
      {latestDraft && (
        <GovernanceMappingEditor
          versionId={latestDraft.id}
        />
      )}

      {/* Version History */}
      <GovernanceVersionHistory
        versions={versions}
        onPublish={(id) => setPublishVersionId(id)}
      />

      {/* Delivery History */}
      <GovernanceDeliveryHistory documentId={documentId} />

      {publishVersionId && (
        <GovernancePublishDialog
          versionId={publishVersionId}
          open={!!publishVersionId}
          onOpenChange={(open) => { if (!open) setPublishVersionId(null); }}
          onSuccess={() => {
            setPublishVersionId(null);
            invalidateAll();
          }}
        />
      )}

      {showImport && (
        <GovernanceImportDialog
          documentId={documentId}
          documentTitle={doc.title}
          open={showImport}
          onOpenChange={setShowImport}
          onSuccess={invalidateAll}
        />
      )}

      {showDelivery && publishedVersion && (
        <GovernanceDeliveryDialog
          documentId={documentId}
          documentVersionId={publishedVersion.id}
          versionNumber={publishedVersion.version_number}
          open={showDelivery}
          onOpenChange={setShowDelivery}
          onSuccess={invalidateAll}
        />
      )}
    </div>
  );
}
