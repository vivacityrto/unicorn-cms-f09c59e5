import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ArrowLeft, ExternalLink, Upload, FileText, Clock, Shield, Send, Tag, Pencil, RefreshCw, Blocks } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useDocumentCategories } from '@/hooks/useDocumentCategories';
import { DocumentAdditionalStagesField } from '@/components/documents/DocumentAdditionalStagesField';
import { GovernanceVersionHistory } from './GovernanceVersionHistory';
import { GovernancePublishDialog } from './GovernancePublishDialog';
import { GovernanceVersionImportDialog } from './GovernanceVersionImportDialog';
import { GovernanceMappingEditor } from './GovernanceMappingEditor';
import { GovernanceDeliveryDialog } from './GovernanceDeliveryDialog';
import { GovernanceDeliveryHistory } from './GovernanceDeliveryHistory';
import { GovernanceTailoringHealth } from './GovernanceTailoringHealth';
import { GovernancePackageAssignments } from './GovernancePackageAssignments';
import { GovernanceDocumentEditDialog } from './GovernanceDocumentEditDialog';
import { MergeFieldsEditor } from '@/components/document/MergeFieldsEditor';

interface GovernanceDocumentDetailProps {
  documentId: number;
  onBack: () => void;
}

export function GovernanceDocumentDetail({ documentId, onBack }: GovernanceDocumentDetailProps) {
  const queryClient = useQueryClient();
  const [publishVersionId, setPublishVersionId] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [mappingVersionId, setMappingVersionId] = useState<string | null>(null);
  const [showDelivery, setShowDelivery] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [checkingDrift, setCheckingDrift] = useState(false);

  const { data: doc, isLoading } = useQuery({
    queryKey: ['governance-doc-detail', documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select(`
          id, title, description, format, category, document_status,
          source_template_url, updated_at, current_published_version_id,
          framework_type, is_core, standard_set, stage
        `)
        .eq('id', documentId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: stagesList } = useQuery({
    queryKey: ['stages-list-for-manage-documents'],
    queryFn: async () => {
      const { data } = await supabase.from('stages').select('id, name').order('name');
      return (data as { id: number; name: string }[]) || [];
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

  const { categories, valueLabelMap } = useDocumentCategories();

  const updateCategory = useMutation({
    mutationFn: async (newCategory: string) => {
      const { error } = await supabase
        .from('documents')
        .update({ category: newCategory })
        .eq('id', documentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Category updated');
      invalidateAll();
    },
    onError: () => toast.error('Failed to update category'),
  });

  const updateStage = useMutation({
    mutationFn: async (newStage: number | null) => {
      const { error } = await supabase
        .from('documents')
        .update({ stage: newStage })
        .eq('id', documentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Stage updated');
      invalidateAll();
    },
    onError: () => toast.error('Failed to update stage'),
  });

  // Find latest draft version for mapping editor
  const latestDraft = versions?.find(v => v.status === 'draft');
  // Find published version for delivery
  const publishedVersion = versions?.find(v => v.id === doc?.current_published_version_id);
  // Prefer editing the draft, but fall back to the current published version
  // so published-only documents (e.g. PowerPoint templates) still show mappings.
  const mappingEditorVersion = latestDraft || publishedVersion;

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

  // Picking a version in the "Current Version" selector only ever promotes a
  // draft -- it reuses the exact same drift-check + mapping-check flow as
  // the old per-row Publish button (GovernancePublishDialog), just triggered
  // from here instead. Archived versions are shown for history but aren't
  // actionable: the publish RPC only accepts a draft.
  const handleVersionSelect = (versionId: string) => {
    if (versionId === doc.current_published_version_id) return;
    const target = versions?.find((v) => v.id === versionId);
    if (!target) return;
    if (target.status !== 'draft') {
      toast.error('Only a draft version can be promoted. Import a new version to make changes.');
      return;
    }
    setPublishVersionId(versionId);
  };

  const handleCheckDrift = async () => {
    if (!publishedVersion) return;
    setCheckingDrift(true);
    try {
      const { data, error } = await supabase.functions.invoke('import-sharepoint-template', {
        body: { action: 'check_drift', version_id: publishedVersion.id },
      });
      if (error) throw error;
      if (!data.checked) {
        toast.warning(data.error || 'Could not check for drift');
      } else if (data.drifted) {
        toast.error('Source file has changed since this version was published');
      } else {
        toast.success('Source file matches what was published — no drift detected');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Drift check failed');
    } finally {
      setCheckingDrift(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{doc.title}</h1>
              <span className="text-xs text-muted-foreground tabular-nums">#{doc.id}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {valueLabelMap.get(doc.category) || doc.category || 'Uncategorised'} • {doc.format || 'Unknown format'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
            <Pencil className="h-4 w-4 mr-2" /> Edit
          </Button>
          {publishedVersion && (
            <Button variant="default" size="sm" onClick={() => setShowDelivery(true)}>
              <Send className="h-4 w-4 mr-2" /> Deliver to Clients
            </Button>
          )}
          {publishedVersion && (
            <Button variant="outline" size="sm" onClick={handleCheckDrift} disabled={checkingDrift}>
              <RefreshCw className={`h-4 w-4 mr-2 ${checkingDrift ? 'animate-spin' : ''}`} /> Check for Drift
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowImportDialog(true)}>
            <Upload className="h-4 w-4 mr-2" /> Import New Version
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
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card className="col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Tag className="h-4 w-4" /> Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={doc.category || ''}
              onValueChange={(val) => updateCategory.mutate(val)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" /> Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {getStatusBadge(doc.document_status)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" /> Framework
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-sm">{doc.framework_type || '—'}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" /> Format
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-sm font-mono">{doc.format || '—'}</span>
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
              <Shield className="h-4 w-4" /> Current Version
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={doc.current_published_version_id || '__none__'}
              onValueChange={handleVersionSelect}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="No version" />
              </SelectTrigger>
              <SelectContent>
                {!doc.current_published_version_id && (
                  <SelectItem value="__none__" disabled>None</SelectItem>
                )}
                {versions?.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.display_version || `v${v.version_number}`}
                    {' — '}
                    {v.status === 'published' ? 'Published' : v.status === 'draft' ? 'Draft' : 'Archived'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {doc.standard_set && (
              <p className="text-xs text-muted-foreground mt-1">{doc.standard_set}</p>
            )}
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

      {/* Required Merge Fields: defines the tags Tailoring Health/delivery grade completeness against */}
      <MergeFieldsEditor documentId={documentId} />

      {/* Mapping Editor: prefer latest draft, fall back to published version */}
      {mappingEditorVersion && (
        <GovernanceMappingEditor
          versionId={mappingEditorVersion.id}
        />
      )}

      {/* Version History */}
      <GovernanceVersionHistory
        versions={versions}
        onPublish={(id) => setPublishVersionId(id)}
        onSaved={invalidateAll}
      />

      {/* Delivery History */}
      <GovernanceDeliveryHistory documentId={documentId} />

      {/* Stage Assignment: the template-level document_stage_links + documents.stage
          link that drives which stage instances this document gets seeded into.
          Distinct from the read-only "Stage & Package Assignments" card below,
          which shows where it has actually been provisioned to real tenants. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Blocks className="h-4 w-4" /> Stage Assignment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Primary Stage</Label>
            <Select
              value={doc.stage ? String(doc.stage) : '__none__'}
              onValueChange={(v) => updateStage.mutate(v === '__none__' ? null : parseInt(v))}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {stagesList?.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DocumentAdditionalStagesField
            documentId={documentId}
            stages={stagesList}
            primaryStageId={doc.stage ?? null}
          />
        </CardContent>
      </Card>

      {/* Package Assignments */}
      <GovernancePackageAssignments documentId={documentId} />

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

      <GovernanceVersionImportDialog
        documentId={documentId}
        documentTitle={doc.title}
        frameworkType={doc.framework_type}
        latestDisplayVersion={versions?.[0]?.display_version ?? null}
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onSuccess={invalidateAll}
      />

      {showDelivery && publishedVersion && (
        <GovernanceDeliveryDialog
          documentId={documentId}
          documentVersionId={publishedVersion.id}
          displayVersion={publishedVersion.display_version}
          versionNumber={publishedVersion.version_number}
          open={showDelivery}
          onOpenChange={setShowDelivery}
          onSuccess={invalidateAll}
        />
      )}

      <GovernanceDocumentEditDialog
        documentId={documentId}
        open={showEdit}
        onOpenChange={setShowEdit}
        onSuccess={invalidateAll}
      />
    </div>
  );
}
