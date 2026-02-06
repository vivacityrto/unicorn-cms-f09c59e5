import { useState, useRef } from 'react';
import { useUploadPortalDocument } from '@/hooks/usePortalDocuments';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Upload, FileText, Loader2, X } from 'lucide-react';

interface UploadDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  direction?: 'vivacity_to_client' | 'client_to_vivacity' | 'internal';
}

export function UploadDocumentDialog({ 
  open, 
  onOpenChange, 
  tenantId,
  direction = 'vivacity_to_client' 
}: UploadDocumentDialogProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [shareWithClient, setShareWithClient] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadDoc = useUploadPortalDocument();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setSelectedFiles(Array.from(files));
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(files => files.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFiles.length === 0) return;

    for (const file of selectedFiles) {
      await uploadDoc.mutateAsync({
        tenantId,
        file,
        direction,
        isClientVisible: shareWithClient,
      });
    }

    // Reset and close
    setSelectedFiles([]);
    setShareWithClient(true);
    onOpenChange(false);
  };

  const handleClose = () => {
    setSelectedFiles([]);
    setShareWithClient(true);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            Upload a document to share with the client.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* File Upload Area */}
          <div className="space-y-3">
            <Label>Select Files</Label>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              className="hidden"
            />
            
            {selectedFiles.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed rounded-lg p-8 text-center hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Click to select files</p>
                <p className="text-xs text-muted-foreground mt-1">or drag and drop</p>
              </button>
            ) : (
              <div className="space-y-2">
                <div className="max-h-[200px] overflow-y-auto space-y-2 pr-1">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                      <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveFile(index)}
                        className="h-8 w-8 flex-shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full"
                >
                  Add more files
                </Button>
              </div>
            )}
          </div>

          {/* Share Option */}
          {direction === 'vivacity_to_client' && (
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Share with client immediately</Label>
                <p className="text-xs text-muted-foreground">
                  Client will see this document in their portal
                </p>
              </div>
              <Switch
                checked={shareWithClient}
                onCheckedChange={setShareWithClient}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={selectedFiles.length === 0 || uploadDoc.isPending}
              className="gap-2"
            >
              {uploadDoc.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Upload {selectedFiles.length > 1 ? `${selectedFiles.length} files` : 'file'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
