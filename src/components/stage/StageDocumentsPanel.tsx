import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { 
  Plus, Trash2, FileText, Upload, Link2, GripVertical, 
  Loader2, Search, X, CheckCircle2, AlertCircle, Eye, EyeOff, History, Package, Layers, AlertTriangle, Filter, Pencil
} from 'lucide-react';
import { DocumentVersionBadge } from '@/components/document/DocumentVersionBadge';
import { BulkUploadWithMetadataDialog } from '@/components/document/BulkUploadWithMetadataDialog';
import { DocumentReadinessBadge } from '@/components/document/DocumentReadinessBadge';
import { GeneratePackDialog } from '@/components/document/GeneratePackDialog';
import { DocumentReuseWarningDialog } from '@/components/document/DocumentReuseWarningDialog';
import { AIConfidenceBadge, type AIStatus } from '@/components/document/AIConfidenceBadge';
import { ExcelBindingStatusBadge } from '@/components/document/ExcelBindingStatusBadge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Document {
  id: number;
  title: string;
  format: string | null;
  category: string | null;
  description?: string | null;
  document_status?: string | null;
  current_published_version_id?: string | null;
  ai_status?: AIStatus;
  ai_confidence_score?: number | null;
  ai_category_confidence?: number | null;
  ai_description_confidence?: number | null;
  ai_reasoning?: string | null;
}

interface StageDocumentItem {
  id: number;
  stage_id: number;
  document_id: number;
  sort_order: number;
  visibility: string;
  delivery_type: string;
  is_tenant_visible: boolean;
  is_required: boolean;
  notes: string | null;
  pinned_version_id: string | null;
  document?: Document;
}

interface StageDocumentsPanelProps {
  stageId: number;
  stageName?: string;
  documents: StageDocumentItem[];
  loading: boolean;
  onRefresh: () => void;
  onDelete: (docId: number) => Promise<void>;
  onUpdate: (docId: number, data: { is_tenant_visible?: boolean; is_required?: boolean }) => Promise<void>;
  isCertified?: boolean;
  wrapCertifiedAction?: (fn: () => void) => void;
  tenantId?: number;
}

export function StageDocumentsPanel({
  stageId,
  stageName = 'Phase',
  documents,
  loading,
  onRefresh,
  onDelete,
  onUpdate,
  isCertified = false,
  wrapCertifiedAction,
  tenantId
}: StageDocumentsPanelProps) {
  const { toast } = useToast();
  
  // Upload dialog state - using new metadata dialog
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [packDialogOpen, setPackDialogOpen] = useState(false);
  
  // Link from library dialog state
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [libraryDocs, setLibraryDocs] = useState<Document[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocIds, setSelectedDocIds] = useState<Set<number>>(new Set());
  const [isLinking, setIsLinking] = useState(false);
  
  // Document reuse warning state
  const [reuseWarningOpen, setReuseWarningOpen] = useState(false);
  const [selectedDocForEdit, setSelectedDocForEdit] = useState<{ id: number; title: string; stageCount: number; stageNames: string[] } | null>(null);
  
  // Stage counts for documents
  const [documentStageCounts, setDocumentStageCounts] = useState<Map<number, { count: number; names: string[] }>>(new Map());
  
  // AI status filter
  const [aiStatusFilter, setAiStatusFilter] = useState<string>('all');

  // Get file type badge color
  const getFileTypeBadge = (format: string | null) => {
    const formatLower = (format || '').toLowerCase();
    if (formatLower.includes('pdf')) return { label: 'PDF', className: 'bg-red-100 text-red-700 border-red-200' };
    if (formatLower.includes('doc') || formatLower.includes('word')) return { label: 'Word', className: 'bg-blue-100 text-blue-700 border-blue-200' };
    if (formatLower.includes('xls') || formatLower.includes('excel')) return { label: 'Excel', className: 'bg-green-100 text-green-700 border-green-200' };
    if (formatLower.includes('ppt') || formatLower.includes('powerpoint')) return { label: 'PPT', className: 'bg-orange-100 text-orange-700 border-orange-200' };
    return { label: format || 'File', className: 'bg-muted text-muted-foreground' };
  };

  // Handle bulk upload success
  const handleBulkUploadSuccess = () => {
    setUploadDialogOpen(false);
    onRefresh();
  };

  // Fetch stage usage counts for linked documents
  const fetchDocumentStageCounts = useCallback(async () => {
    const docIds = documents.map(d => d.document_id);
    if (docIds.length === 0) return;
    
    try {
      const { data, error } = await supabase
        .from('document_stage_usage')
        .select('document_id, stage_count, stage_names')
        .in('document_id', docIds);
      
      if (error) throw error;
      
      const countsMap = new Map<number, { count: number; names: string[] }>();
      (data || []).forEach(row => {
        countsMap.set(row.document_id, { count: row.stage_count, names: row.stage_names || [] });
      });
      setDocumentStageCounts(countsMap);
    } catch (error) {
      console.error('Failed to fetch stage counts:', error);
    }
  }, [documents]);

  useEffect(() => {
    fetchDocumentStageCounts();
  }, [fetchDocumentStageCounts]);

  // Fetch library documents
  const fetchLibraryDocs = useCallback(async () => {
    setLoadingLibrary(true);
    try {
      // Get already linked document IDs
      const linkedIds = new Set(documents.map(d => d.document_id));
      
      const { data, error } = await supabase
        .from('documents')
        .select('id, title, format, category, description')
        .order('title', { ascending: true })
        .limit(200);

      if (error) throw error;
      
      // Filter out already linked docs
      const available = (data || []).filter(d => !linkedIds.has(d.id));
      setLibraryDocs(available);
    } catch (error) {
      console.error('Failed to fetch library:', error);
    } finally {
      setLoadingLibrary(false);
    }
  }, [documents]);

  // Open link dialog
  const openLinkDialog = () => {
    setSelectedDocIds(new Set());
    setSearchQuery('');
    setLinkDialogOpen(true);
    fetchLibraryDocs();
  };

  // Toggle document selection
  const toggleDocSelection = (docId: number) => {
    setSelectedDocIds(prev => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  // Link selected documents
  const handleLinkSelected = async () => {
    if (selectedDocIds.size === 0) return;
    
    setIsLinking(true);
    const docIds = Array.from(selectedDocIds);
    const maxOrder = documents.reduce((max, d) => Math.max(max, d.sort_order), -1);

    try {
      const inserts = docIds.map((docId, idx) => ({
        stage_id: stageId,
        document_id: docId,
        sort_order: maxOrder + 1 + idx,
        visibility: 'both',
        delivery_type: 'manual',
        is_tenant_visible: true,
        is_required: false
      }));

      const { error } = await supabase
        .from('stage_documents')
        .insert(inserts);

      if (error) {
        if (error.code === '23505') {
          throw new Error('Some documents are already linked to this stage');
        }
        throw error;
      }

      // Log audit event
      await supabase.from('audit_events').insert({
        entity: 'stage',
        entity_id: stageId.toString(),
        action: 'stage_document_linked',
        details: { document_ids: docIds, count: docIds.length }
      });

      toast({
        title: 'Documents Linked',
        description: `${docIds.length} document${docIds.length !== 1 ? 's' : ''} linked to stage`
      });

      onRefresh();
      setLinkDialogOpen(false);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to link documents',
        variant: 'destructive'
      });
    } finally {
      setIsLinking(false);
    }
  };

  // Handle unlink (wrapper for delete)
  const handleUnlink = async (docId: number) => {
    try {
      await onDelete(docId);
      
      // Log audit event
      await supabase.from('audit_events').insert({
        entity: 'stage',
        entity_id: stageId.toString(),
        action: 'stage_document_unlinked',
        details: { stage_document_id: docId }
      });
      
      toast({ title: 'Document unlinked from stage' });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to unlink document',
        variant: 'destructive'
      });
    }
  };

  // Filter library docs by search
  const filteredLibraryDocs = libraryDocs.filter(doc => 
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (doc.category || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Wrap action if certified
  const safeAction = (fn: () => void) => {
    if (wrapCertifiedAction) {
      wrapCertifiedAction(fn);
    } else {
      fn();
    }
  };
  
  // Handle document edit with reuse warning
  const handleDocumentClick = (doc: StageDocumentItem) => {
    const stageData = documentStageCounts.get(doc.document_id);
    const stageCount = stageData?.count || 0;
    
    if (stageCount > 1) {
      setSelectedDocForEdit({
        id: doc.document_id,
        title: doc.document?.title || 'Document',
        stageCount,
        stageNames: stageData?.names || []
      });
      setReuseWarningOpen(true);
    } else {
      // Navigate directly to document detail
      window.open(`/admin/documents/${doc.document_id}`, '_blank');
    }
  };
  
  const handleEditAnyway = () => {
    if (selectedDocForEdit) {
      window.open(`/admin/documents/${selectedDocForEdit.id}`, '_blank');
    }
    setReuseWarningOpen(false);
    setSelectedDocForEdit(null);
  };
  
  const handleDuplicateDocument = async () => {
    if (!selectedDocForEdit) return;
    
    try {
      // Fetch original document
      const { data: original, error: fetchError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', selectedDocForEdit.id)
        .single();
      
      if (fetchError) throw fetchError;
      
      // Create duplicate - extract only the fields we want to copy
      const { id, ...docWithoutId } = original;
      const { data: newDoc, error: insertError } = await supabase
        .from('documents')
        .insert({
          title: `${original.title} (Copy)`,
          description: original.description,
          format: original.format,
          category: original.category,
          document_category: original.document_category,
          watermark: original.watermark,
          isclientdoc: original.isclientdoc
        })
        .select()
        .single();
      
      if (insertError) throw insertError;
      
      // Update stage_documents to point to new document
      const currentStageDoc = documents.find(d => d.document_id === selectedDocForEdit.id);
      if (currentStageDoc) {
        await supabase
          .from('stage_documents')
          .update({ document_id: newDoc.id })
          .eq('id', currentStageDoc.id);
      }
      
      toast({ title: 'Document duplicated and relinked' });
      onRefresh();
    } catch (error) {
      console.error('Failed to duplicate:', error);
      toast({ title: 'Failed to duplicate document', variant: 'destructive' });
    }
    
    setReuseWarningOpen(false);
    setSelectedDocForEdit(null);
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Documents</CardTitle>
              <Select value={aiStatusFilter} onValueChange={setAiStatusFilter}>
                <SelectTrigger className="h-7 w-[140px] text-xs">
                  <Filter className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="AI Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="auto_approved">Auto-approved</SelectItem>
                  <SelectItem value="needs_review">Needs Review</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              {tenantId && documents.length > 0 && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setPackDialogOpen(true)}
                >
                  <Package className="h-3 w-3 mr-1" />
                  Generate Pack
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => safeAction(openLinkDialog)}
              >
                <Link2 className="h-3 w-3 mr-1" />
                Link from Library
              </Button>
              <Button 
                size="sm" 
                onClick={() => safeAction(() => setUploadDialogOpen(true))}
              >
                <Upload className="h-3 w-3 mr-1" />
                Bulk Upload
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg">
              <FileText className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground mb-4">No documents linked to this stage</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => safeAction(openLinkDialog)}>
                  <Link2 className="h-3 w-3 mr-1" />
                  Link from Library
                </Button>
                <Button size="sm" onClick={() => safeAction(() => setUploadDialogOpen(true))}>
                  <Upload className="h-3 w-3 mr-1" />
                  Upload Documents
                </Button>
              </div>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {documents
                  .filter(doc => {
                    if (aiStatusFilter === 'all') return true;
                    const docAiStatus = doc.document?.ai_status || 'pending';
                    return docAiStatus === aiStatusFilter;
                  })
                  .map((doc) => {
                  const fileType = getFileTypeBadge(doc.document?.format || null);
                  const stageData = documentStageCounts.get(doc.document_id);
                  const stageCount = stageData?.count || 0;
                  const isMultiStage = stageCount > 1;
                  
                  return (
                    <div 
                      key={doc.id} 
                      className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30 group cursor-pointer hover:bg-muted/50"
                      onClick={() => doc.document && handleDocumentClick(doc)}
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab opacity-50 group-hover:opacity-100" />
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium block truncate">{doc.document?.title || 'Unknown Document'}</span>
                          {isMultiStage && (
                            <Badge 
                              variant="outline" 
                              className="text-xs border-amber-200 bg-amber-50 text-amber-700 flex items-center gap-1"
                            >
                              <Layers className="h-3 w-3" />
                              {stageCount}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className={`text-xs ${fileType.className}`}>
                            {fileType.label}
                          </Badge>
                          {doc.document?.category && (
                            <Badge variant="secondary" className="text-xs">
                              {doc.document.category}
                            </Badge>
                          )}
                          {doc.document && (
                            <DocumentVersionBadge 
                              status={(doc.document.document_status || 'draft') as 'draft' | 'published' | 'archived'} 
                              showVersion={false}
                              size="sm"
                            />
                          )}
                          {doc.document && (
                            <DocumentReadinessBadge
                              documentId={doc.document.id}
                              tenantId={tenantId}
                              isExcel={doc.document.format?.toLowerCase().includes('excel') || doc.document.format?.toLowerCase().includes('xls')}
                              compact
                            />
                          )}
                          {doc.document && (doc.document.format?.toLowerCase().includes('excel') || doc.document.format?.toLowerCase().includes('xls')) && (
                            <ExcelBindingStatusBadge
                              documentId={doc.document.id}
                              compact
                            />
                          )}
                          {doc.document?.ai_status && (
                            <AIConfidenceBadge
                              aiStatus={doc.document.ai_status}
                              overallConfidence={doc.document.ai_confidence_score}
                              categoryConfidence={doc.document.ai_category_confidence}
                              descriptionConfidence={doc.document.ai_description_confidence}
                              reasoning={doc.document.ai_reasoning}
                              compact
                            />
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`visible-${doc.id}`} className="text-xs text-muted-foreground flex items-center gap-1 cursor-pointer">
                            {doc.is_tenant_visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                            <span className="hidden sm:inline">Visible</span>
                          </Label>
                          <Switch
                            id={`visible-${doc.id}`}
                            checked={doc.is_tenant_visible}
                            onCheckedChange={(checked) => safeAction(() => onUpdate(doc.id, { is_tenant_visible: checked }))}
                            className="scale-75"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`required-${doc.id}`} className="text-xs text-muted-foreground hidden sm:inline">
                            Required
                          </Label>
                          <Switch
                            id={`required-${doc.id}`}
                            checked={doc.is_required}
                            onCheckedChange={(checked) => safeAction(() => onUpdate(doc.id, { is_required: checked }))}
                            className="scale-75"
                          />
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 opacity-50 group-hover:opacity-100" 
                          onClick={() => doc.document && handleDocumentClick(doc)}
                          title="Edit document"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 opacity-50 group-hover:opacity-100" 
                          onClick={() => safeAction(() => handleUnlink(doc.id))}
                          title="Unlink from stage"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Bulk Upload Dialog with Metadata */}
      <BulkUploadWithMetadataDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onSuccess={handleBulkUploadSuccess}
        stageId={stageId}
      />

      {/* Link from Library Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Link Documents from Library
            </DialogTitle>
            <DialogDescription>
              Select existing documents to link to this stage. Documents can be reused across multiple stages.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="border rounded-lg">
            {loadingLibrary ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredLibraryDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-muted-foreground text-sm">
                  {searchQuery ? 'No documents match your search' : 'No available documents to link'}
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[300px]">
                <div className="divide-y">
                  {filteredLibraryDocs.map((doc) => {
                    const isSelected = selectedDocIds.has(doc.id);
                    const fileType = getFileTypeBadge(doc.format);
                    return (
                      <div
                        key={doc.id}
                        className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
                          isSelected ? 'bg-primary/10' : 'hover:bg-muted/50'
                        }`}
                        onClick={() => toggleDocSelection(doc.id)}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleDocSelection(doc.id)}
                        />
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium block truncate">{doc.title}</span>
                          {doc.description && (
                            <p className="text-xs text-muted-foreground truncate">{doc.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className={`text-xs ${fileType.className}`}>
                            {fileType.label}
                          </Badge>
                          {doc.category && (
                            <Badge variant="secondary" className="text-xs">
                              {doc.category}
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>

          {selectedDocIds.size > 0 && (
            <p className="text-sm text-muted-foreground">
              {selectedDocIds.size} document{selectedDocIds.size !== 1 ? 's' : ''} selected
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleLinkSelected}
              disabled={selectedDocIds.size === 0 || isLinking}
            >
              {isLinking ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Linking...
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4 mr-2" />
                  Link {selectedDocIds.size} Document{selectedDocIds.size !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Pack Dialog */}
      {tenantId && (
        <GeneratePackDialog
          open={packDialogOpen}
          onOpenChange={setPackDialogOpen}
          tenantId={tenantId}
          stageId={stageId}
          stageName={stageName}
          documents={documents.map(d => ({
            id: d.document?.id || 0,
            name: d.document?.title || 'Unknown',
            file_path: null, // Will be fetched from uploaded_files
            current_published_version_id: d.document?.current_published_version_id || null
          })).filter(d => d.id > 0)}
        />
      )}

      {/* Document Reuse Warning Dialog */}
      {selectedDocForEdit && (
        <DocumentReuseWarningDialog
          open={reuseWarningOpen}
          onOpenChange={setReuseWarningOpen}
          documentTitle={selectedDocForEdit.title}
          stageCount={selectedDocForEdit.stageCount}
          stageNames={selectedDocForEdit.stageNames}
          onEditAnyway={handleEditAnyway}
          onDuplicate={handleDuplicateDocument}
        />
      )}
    </>
  );
}
