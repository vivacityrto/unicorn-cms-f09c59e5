import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, FileText, X, CheckCircle2, AlertCircle, Settings2 } from 'lucide-react';
import { useBulkDocumentUpload } from '@/hooks/useDocumentVersions';

interface BulkUploadWithMetadataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  stageId?: number;
  storageBucket?: string;
}

interface FileUploadStatus {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  documentId?: number;
}

const DOCUMENT_CATEGORIES = [
  'Policy',
  'Procedure',
  'Form',
  'Template',
  'Guide',
  'Checklist',
  'Record',
  'Report',
  'Manual',
  'Other'
];

const STANDARD_SETS = [
  'SRTO 2015',
  'AQTF',
  'CRICOS',
  'ELICOS',
  'ISO 9001',
  'Other'
];

export function BulkUploadWithMetadataDialog({
  open,
  onOpenChange,
  onSuccess,
  stageId,
  storageBucket = 'document-files'
}: BulkUploadWithMetadataDialogProps) {
  const { toast } = useToast();
  const { uploadDocuments, uploading: creatingDocs } = useBulkDocumentUpload();
  
  const [files, setFiles] = useState<FileUploadStatus[]>([]);
  const [category, setCategory] = useState<string>('');
  const [standardSet, setStandardSet] = useState<string>('');
  const [standardRefs, setStandardRefs] = useState<string>('');
  const [autoPublish, setAutoPublish] = useState(false);
  const [linkToStage, setLinkToStage] = useState(!!stageId);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [step, setStep] = useState<'metadata' | 'files'>('metadata');

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = (newFiles: File[]) => {
    const fileStatuses: FileUploadStatus[] = newFiles.map(file => ({
      file,
      status: 'pending'
    }));
    setFiles(prev => [...prev, ...fileStatuses]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      toast({
        title: 'Error',
        description: 'Please add files to upload',
        variant: 'destructive'
      });
      return;
    }

    setUploading(true);
    setProgress(0);

    const totalFiles = files.length;
    let completedFiles = 0;
    const uploadedDocs: { title: string; storage_path: string; file_name: string; mime_type: string; file_size: number }[] = [];

    // First, upload all files to storage
    for (let i = 0; i < files.length; i++) {
      const fileStatus = files[i];
      
      setFiles(prev => prev.map((f, idx) => 
        idx === i ? { ...f, status: 'uploading' } : f
      ));

      try {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const uuid = crypto.randomUUID();
        const sanitizedName = fileStatus.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = stageId 
          ? `stages/${stageId}/${year}/${month}/${uuid}-${sanitizedName}`
          : `library/${year}/${month}/${uuid}-${sanitizedName}`;

        const { error: uploadError } = await supabase.storage
          .from(storageBucket)
          .upload(storagePath, fileStatus.file, {
            contentType: fileStatus.file.type,
            upsert: false
          });

        if (uploadError) throw uploadError;

        uploadedDocs.push({
          title: fileStatus.file.name.replace(/\.[^/.]+$/, ''),
          storage_path: storagePath,
          file_name: fileStatus.file.name,
          mime_type: fileStatus.file.type,
          file_size: fileStatus.file.size
        });

        setFiles(prev => prev.map((f, idx) => 
          idx === i ? { ...f, status: 'success' } : f
        ));
      } catch (error: any) {
        console.error('Upload error:', error);
        setFiles(prev => prev.map((f, idx) => 
          idx === i ? { ...f, status: 'error', error: error.message } : f
        ));
      }

      completedFiles++;
      setProgress(Math.round((completedFiles / totalFiles) * 50)); // 50% for file uploads
    }

    // Then, create document records with versions
    if (uploadedDocs.length > 0) {
      setProgress(60);
      
      const results = await uploadDocuments(uploadedDocs, {
        category: category || undefined,
        standardSet: standardSet || undefined,
        standardRefs: standardRefs ? standardRefs.split(',').map(s => s.trim()) : undefined,
        autoPublish
      });

      setProgress(80);

      // If linking to stage, create stage_documents records
      if (linkToStage && stageId && results.length > 0) {
        try {
          const { data: maxOrderData } = await supabase
            .from('stage_documents')
            .select('sort_order')
            .eq('stage_id', stageId)
            .order('sort_order', { ascending: false })
            .limit(1)
            .single();

          const startOrder = (maxOrderData?.sort_order || 0) + 1;

          const stageDocInserts = results.map((result, idx) => ({
            stage_id: stageId,
            document_id: result.document_id,
            sort_order: startOrder + idx,
            visibility: 'both',
            delivery_type: 'manual',
            is_tenant_visible: true,
            is_required: false
          }));

          await supabase.from('stage_documents').insert(stageDocInserts);
        } catch (error) {
          console.error('Failed to link documents to stage:', error);
        }
      }

      setProgress(100);
    }

    setUploading(false);

    const successCount = files.filter(f => f.status === 'success').length;
    const failedCount = files.filter(f => f.status === 'error').length;

    if (failedCount === 0) {
      toast({
        title: 'Success',
        description: `${successCount} document${successCount !== 1 ? 's' : ''} uploaded and created`
      });
      handleClose();
      onSuccess();
    } else {
      toast({
        title: 'Partial Success',
        description: `${successCount} uploaded, ${failedCount} failed`,
        variant: 'destructive'
      });
    }
  };

  const handleClose = () => {
    setFiles([]);
    setCategory('');
    setStandardSet('');
    setStandardRefs('');
    setAutoPublish(false);
    setProgress(0);
    setStep('metadata');
    onOpenChange(false);
  };

  const canProceedToFiles = true; // Metadata is optional

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Upload Documents</DialogTitle>
          <DialogDescription>
            {step === 'metadata' 
              ? 'Set default metadata for all uploaded documents'
              : 'Select files to upload'
            }
          </DialogDescription>
        </DialogHeader>

        {step === 'metadata' ? (
          <div className="space-y-4 py-2">
            {/* Category Selection */}
            <div className="space-y-2">
              <Label>Category (optional)</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No Category</SelectItem>
                  {DOCUMENT_CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Standard Set */}
            <div className="space-y-2">
              <Label>Standard Set (optional)</Label>
              <Select value={standardSet} onValueChange={setStandardSet}>
                <SelectTrigger>
                  <SelectValue placeholder="Select standard set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No Standard Set</SelectItem>
                  {STANDARD_SETS.map(std => (
                    <SelectItem key={std} value={std}>{std}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Standard References */}
            <div className="space-y-2">
              <Label>Standard References (optional)</Label>
              <Input
                value={standardRefs}
                onChange={(e) => setStandardRefs(e.target.value)}
                placeholder="e.g., 1.1, 1.2, 2.1 (comma-separated)"
              />
              <p className="text-xs text-muted-foreground">
                Enter comma-separated standard clause references
              </p>
            </div>

            {/* Auto-publish */}
            <div className="flex items-center gap-2 pt-2">
              <Checkbox
                id="autoPublish"
                checked={autoPublish}
                onCheckedChange={(checked) => setAutoPublish(!!checked)}
              />
              <Label htmlFor="autoPublish" className="cursor-pointer">
                Auto-publish documents (make immediately available)
              </Label>
            </div>

            {/* Link to stage */}
            {stageId && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="linkToStage"
                  checked={linkToStage}
                  onCheckedChange={(checked) => setLinkToStage(!!checked)}
                />
                <Label htmlFor="linkToStage" className="cursor-pointer">
                  Link uploaded documents to this stage
                </Label>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Metadata Summary */}
            {(category || standardSet) && (
              <div className="flex items-center gap-2 flex-wrap">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                {category && <Badge variant="secondary">{category}</Badge>}
                {standardSet && <Badge variant="outline">{standardSet}</Badge>}
                {autoPublish && <Badge className="bg-green-100 text-green-700">Auto-publish</Badge>}
              </div>
            )}

            {/* Drop Zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border hover:border-primary/50'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">
                Drag and drop files here, or
              </p>
              <label className="cursor-pointer">
                <Button type="button" variant="outline" size="sm" asChild>
                  <span>
                    Browse Files
                    <input
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                    />
                  </span>
                </Button>
              </label>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <ScrollArea className="h-48">
                <div className="space-y-2">
                  {files.map((fileStatus, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-2 rounded-md bg-muted/50"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="flex-1 text-sm truncate">
                        {fileStatus.file.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {(fileStatus.file.size / 1024).toFixed(0)} KB
                      </span>
                      {fileStatus.status === 'success' && (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                      {fileStatus.status === 'error' && (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      )}
                      {fileStatus.status === 'pending' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(index)}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            {/* Progress */}
            {(uploading || creatingDocs) && (
              <div className="space-y-2">
                <Progress value={progress} />
                <p className="text-xs text-muted-foreground text-center">
                  {progress < 50 ? 'Uploading files...' : 'Creating document records...'} {progress}%
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'metadata' ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={() => setStep('files')} disabled={!canProceedToFiles}>
                Continue to Upload
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep('metadata')} disabled={uploading}>
                Back
              </Button>
              <Button 
                onClick={handleUpload} 
                disabled={uploading || creatingDocs || files.length === 0}
              >
                {uploading || creatingDocs 
                  ? 'Processing...' 
                  : `Upload ${files.length} File${files.length !== 1 ? 's' : ''}`
                }
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
