import { useState, useCallback } from 'react';
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
  Loader2, Search, X, CheckCircle2, AlertCircle, Eye, EyeOff
} from 'lucide-react';

interface Document {
  id: number;
  title: string;
  format: string | null;
  category: string | null;
  description?: string | null;
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
  document?: Document;
}

interface UploadProgress {
  fileName: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

interface StageDocumentsPanelProps {
  stageId: number;
  documents: StageDocumentItem[];
  loading: boolean;
  onRefresh: () => void;
  onDelete: (docId: number) => Promise<void>;
  onUpdate: (docId: number, data: { is_tenant_visible?: boolean; is_required?: boolean }) => Promise<void>;
  isCertified?: boolean;
  wrapCertifiedAction?: (fn: () => void) => void;
}

const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
];

const FILE_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];

export function StageDocumentsPanel({
  stageId,
  documents,
  loading,
  onRefresh,
  onDelete,
  onUpdate,
  isCertified = false,
  wrapCertifiedAction
}: StageDocumentsPanelProps) {
  const { toast } = useToast();
  
  // Upload dialog state
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  
  // Link from library dialog state
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [libraryDocs, setLibraryDocs] = useState<Document[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocIds, setSelectedDocIds] = useState<Set<number>>(new Set());
  const [isLinking, setIsLinking] = useState(false);

  // Get file type badge color
  const getFileTypeBadge = (format: string | null) => {
    const formatLower = (format || '').toLowerCase();
    if (formatLower.includes('pdf')) return { label: 'PDF', className: 'bg-red-100 text-red-700 border-red-200' };
    if (formatLower.includes('doc') || formatLower.includes('word')) return { label: 'Word', className: 'bg-blue-100 text-blue-700 border-blue-200' };
    if (formatLower.includes('xls') || formatLower.includes('excel')) return { label: 'Excel', className: 'bg-green-100 text-green-700 border-green-200' };
    if (formatLower.includes('ppt') || formatLower.includes('powerpoint')) return { label: 'PPT', className: 'bg-orange-100 text-orange-700 border-orange-200' };
    return { label: format || 'File', className: 'bg-muted text-muted-foreground' };
  };

  // Handle file selection
  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;
    
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];
    
    Array.from(files).forEach(file => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (FILE_EXTENSIONS.includes(ext) || ALLOWED_FILE_TYPES.includes(file.type)) {
        validFiles.push(file);
      } else {
        invalidFiles.push(file.name);
      }
    });
    
    if (invalidFiles.length > 0) {
      toast({
        title: 'Invalid file types',
        description: `The following files are not supported: ${invalidFiles.join(', ')}`,
        variant: 'destructive'
      });
    }
    
    setUploadFiles(prev => [...prev, ...validFiles]);
  };

  // Remove file from upload queue
  const removeUploadFile = (index: number) => {
    setUploadFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Bulk upload handler
  const handleBulkUpload = async () => {
    if (uploadFiles.length === 0) return;
    
    setIsUploading(true);
    const progress: UploadProgress[] = uploadFiles.map(f => ({
      fileName: f.name,
      progress: 0,
      status: 'pending' as const
    }));
    setUploadProgress(progress);

    const results = { uploaded: 0, linked: 0, failed: 0 };
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    for (let i = 0; i < uploadFiles.length; i++) {
      const file = uploadFiles[i];
      const uuid = crypto.randomUUID();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `stages/${stageId}/${year}/${month}/${uuid}-${sanitizedName}`;

      // Update status to uploading
      setUploadProgress(prev => prev.map((p, idx) => 
        idx === i ? { ...p, status: 'uploading', progress: 10 } : p
      ));

      try {
        // Upload file to storage
        const { error: uploadError } = await supabase.storage
          .from('document-files')
          .upload(storagePath, file, {
            contentType: file.type,
            upsert: false
          });

        if (uploadError) throw uploadError;

        setUploadProgress(prev => prev.map((p, idx) => 
          idx === i ? { ...p, progress: 50 } : p
        ));

        // Create document record
        const docName = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
        const { data: docData, error: docError } = await supabase
          .from('documents')
          .insert({
            title: docName,
            description: '',
            format: file.name.split('.').pop()?.toUpperCase() || null,
            is_team_only: false,
            is_tenant_downloadable: true,
            is_auto_generated: false,
            uploaded_files: [storagePath],
            file_names: [file.name]
          })
          .select('id')
          .single();

        if (docError) throw docError;

        setUploadProgress(prev => prev.map((p, idx) => 
          idx === i ? { ...p, progress: 75 } : p
        ));

        // Link to stage
        const maxOrder = documents.reduce((max, d) => Math.max(max, d.sort_order), -1);
        const { error: linkError } = await supabase
          .from('stage_documents')
          .insert({
            stage_id: stageId,
            document_id: docData.id,
            sort_order: maxOrder + 1 + results.linked,
            visibility: 'both',
            delivery_type: 'manual',
            is_tenant_visible: true,
            is_required: false
          });

        if (linkError) throw linkError;

        // Log audit event
        await supabase.from('audit_events').insert({
          entity: 'stage',
          entity_id: stageId.toString(),
          action: 'stage_document_bulk_uploaded',
          details: { 
            document_id: docData.id, 
            file_name: file.name,
            storage_path: storagePath
          }
        });

        results.uploaded++;
        results.linked++;
        setUploadProgress(prev => prev.map((p, idx) => 
          idx === i ? { ...p, status: 'success', progress: 100 } : p
        ));
      } catch (error: any) {
        console.error('Upload error:', error);
        results.failed++;
        setUploadProgress(prev => prev.map((p, idx) => 
          idx === i ? { ...p, status: 'error', error: error.message, progress: 100 } : p
        ));
      }
    }

    setIsUploading(false);
    
    toast({
      title: 'Upload Complete',
      description: `${results.uploaded} uploaded, ${results.linked} linked${results.failed > 0 ? `, ${results.failed} failed` : ''}`
    });

    if (results.linked > 0) {
      onRefresh();
    }

    // Reset after short delay
    setTimeout(() => {
      setUploadDialogOpen(false);
      setUploadFiles([]);
      setUploadProgress([]);
    }, 1500);
  };

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

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Documents</CardTitle>
              <CardDescription>{documents.length} documents linked to this stage</CardDescription>
            </div>
            <div className="flex items-center gap-2">
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
                {documents.map((doc) => {
                  const fileType = getFileTypeBadge(doc.document?.format || null);
                  return (
                    <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30 group">
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab opacity-50 group-hover:opacity-100" />
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium block truncate">{doc.document?.title || 'Unknown Document'}</span>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className={`text-xs ${fileType.className}`}>
                            {fileType.label}
                          </Badge>
                          {doc.document?.category && (
                            <Badge variant="secondary" className="text-xs">
                              {doc.document.category}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
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

      {/* Bulk Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Bulk Upload Documents
            </DialogTitle>
            <DialogDescription>
              Upload Word, PDF, Excel, or PowerPoint files. They'll be added to the document library and linked to this stage.
            </DialogDescription>
          </DialogHeader>

          {uploadProgress.length === 0 ? (
            <>
              {/* Dropzone */}
              <div 
                className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleFilesSelected(e.dataTransfer.files);
                }}
                onClick={() => document.getElementById('file-upload-input')?.click()}
              >
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground mb-1">
                  Drag and drop files here, or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  Supported: {FILE_EXTENSIONS.join(', ')}
                </p>
                <input
                  id="file-upload-input"
                  type="file"
                  multiple
                  accept={FILE_EXTENSIONS.join(',')}
                  className="hidden"
                  onChange={(e) => handleFilesSelected(e.target.files)}
                />
              </div>

              {/* Selected files */}
              {uploadFiles.length > 0 && (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {uploadFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded bg-muted/50 text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{file.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {(file.size / 1024).toFixed(0)} KB
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeUploadFile(idx)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Upload progress */
            <div className="space-y-3">
              {uploadProgress.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    {item.status === 'success' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    ) : item.status === 'error' ? (
                      <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                    )}
                    <span className="flex-1 truncate">{item.fileName}</span>
                    <span className="text-xs text-muted-foreground">{item.progress}%</span>
                  </div>
                  <Progress value={item.progress} className="h-1" />
                  {item.error && (
                    <p className="text-xs text-destructive">{item.error}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setUploadDialogOpen(false);
                setUploadFiles([]);
                setUploadProgress([]);
              }}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleBulkUpload} 
              disabled={uploadFiles.length === 0 || isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload {uploadFiles.length} File{uploadFiles.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </>
  );
}
