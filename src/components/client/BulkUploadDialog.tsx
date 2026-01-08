import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { ClientPackage } from '@/hooks/useClientManagement';
import { useDocumentActivity } from '@/hooks/useDocumentActivity';

interface BulkUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  tenantId: number;
  packages: ClientPackage[];
  categories: { id: number; name: string }[];
}

interface FileUploadStatus {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

export function BulkUploadDialog({
  open,
  onOpenChange,
  onSuccess,
  tenantId,
  packages,
  categories
}: BulkUploadDialogProps) {
  const { toast } = useToast();
  const { logUpload } = useDocumentActivity();
  const [files, setFiles] = useState<FileUploadStatus[]>([]);
  const [packageId, setPackageId] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [releaseToClient, setReleaseToClient] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

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
      const selectedFiles = Array.from(e.target.files);
      addFiles(selectedFiles);
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
    if (!packageId || files.length === 0) {
      toast({
        title: 'Error',
        description: 'Please select a package and add files',
        variant: 'destructive'
      });
      return;
    }

    setUploading(true);
    setProgress(0);

    const totalFiles = files.length;
    let completedFiles = 0;
    const results: { success: number; failed: number } = { success: 0, failed: 0 };

    for (let i = 0; i < files.length; i++) {
      const fileStatus = files[i];
      
      // Update status to uploading
      setFiles(prev => prev.map((f, idx) => 
        idx === i ? { ...f, status: 'uploading' } : f
      ));

      try {
        // Upload file to storage
        const fileName = `${Date.now()}-${fileStatus.file.name}`;
        const filePath = `package-${packageId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('package-documents')
          .upload(filePath, fileStatus.file);

        if (uploadError) throw uploadError;

        // Create document record
        const docTitle = fileStatus.file.name.replace(/\.[^/.]+$/, ''); // Remove extension
        
        const { data: insertedDoc, error: insertError } = await supabase
          .from('documents')
          .insert({
            title: docTitle,
            package_id: parseInt(packageId),
            tenant_id: tenantId,
            uploaded_files: [filePath],
            is_released: releaseToClient,
            category: category || null,
            isclientdoc: true
          })
          .select('id')
          .single();

        if (insertError) throw insertError;

        // Log upload activity for timeline
        if (insertedDoc?.id) {
          logUpload({
            tenantId: tenantId,
            clientId: tenantId,
            packageId: parseInt(packageId),
            documentId: insertedDoc.id,
            fileName: docTitle,
            actorRole: 'internal'
          });
        }

        // Update status to success
        setFiles(prev => prev.map((f, idx) => 
          idx === i ? { ...f, status: 'success' } : f
        ));
        results.success++;
      } catch (error: any) {
        console.error('Upload error:', error);
        // Update status to error
        setFiles(prev => prev.map((f, idx) => 
          idx === i ? { ...f, status: 'error', error: error.message } : f
        ));
        results.failed++;
      }

      completedFiles++;
      setProgress(Math.round((completedFiles / totalFiles) * 100));
    }

    setUploading(false);

    if (results.failed === 0) {
      toast({
        title: 'Success',
        description: `${results.success} document${results.success > 1 ? 's' : ''} uploaded successfully`
      });
      handleClose();
      onSuccess();
    } else {
      toast({
        title: 'Partial Success',
        description: `${results.success} uploaded, ${results.failed} failed`,
        variant: 'destructive'
      });
    }
  };

  const handleClose = () => {
    setFiles([]);
    setPackageId('');
    setCategory('');
    setReleaseToClient(false);
    setProgress(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Upload Documents</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Package Selection */}
          <div className="space-y-2">
            <Label>Package *</Label>
            <Select value={packageId} onValueChange={setPackageId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a package" />
              </SelectTrigger>
              <SelectContent>
                {packages.map(pkg => (
                  <SelectItem key={pkg.package_id} value={pkg.package_id.toString()}>
                    {pkg.package_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category Selection */}
          <div className="space-y-2">
            <Label>Category (optional)</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No Category</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat.id} value={cat.name}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Release to Client */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="release"
              checked={releaseToClient}
              onCheckedChange={(checked) => setReleaseToClient(!!checked)}
            />
            <Label htmlFor="release" className="cursor-pointer">
              Release to client immediately
            </Label>
          </div>

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
                  />
                </span>
              </Button>
            </label>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
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
          )}

          {/* Progress */}
          {uploading && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-xs text-muted-foreground text-center">
                Uploading... {progress}%
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            Cancel
          </Button>
          <Button 
            onClick={handleUpload} 
            disabled={uploading || files.length === 0 || !packageId}
          >
            {uploading ? 'Uploading...' : `Upload ${files.length} File${files.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
