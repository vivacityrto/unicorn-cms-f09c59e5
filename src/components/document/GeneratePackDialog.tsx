import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Package, Download, Loader2, ExternalLink, CheckCircle } from "lucide-react";
import { useTenantPacks } from "@/hooks/useTenantPacks";

interface Document {
  id: number;
  name: string;
  file_path?: string | null;
  current_published_version_id?: string | null;
}

interface GeneratePackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  stageId: number;
  stageName: string;
  documents: Document[];
}

export function GeneratePackDialog({
  open,
  onOpenChange,
  tenantId,
  stageId,
  stageName,
  documents
}: GeneratePackDialogProps) {
  const [packName, setPackName] = useState(`${stageName} - Document Pack`);
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>(
    documents.filter(d => d.file_path || d.current_published_version_id).map(d => d.id)
  );
  const [generating, setGenerating] = useState(false);
  const [generatedPack, setGeneratedPack] = useState<{
    files: { name: string; url: string }[];
    pack_id: string;
    expires_at: string;
  } | null>(null);

  const { generatePack, trackDownload } = useTenantPacks(tenantId);

  const availableDocuments = documents.filter(d => d.file_path || d.current_published_version_id);

  const handleToggleDocument = (docId: number) => {
    setSelectedDocIds(prev =>
      prev.includes(docId)
        ? prev.filter(id => id !== docId)
        : [...prev, docId]
    );
  };

  const handleSelectAll = () => {
    if (selectedDocIds.length === availableDocuments.length) {
      setSelectedDocIds([]);
    } else {
      setSelectedDocIds(availableDocuments.map(d => d.id));
    }
  };

  const handleGenerate = async () => {
    if (selectedDocIds.length === 0) return;
    
    setGenerating(true);
    const result = await generatePack(tenantId, stageId, selectedDocIds, packName);
    setGenerating(false);

    if (result) {
      setGeneratedPack({
        files: result.files,
        pack_id: result.pack_id,
        expires_at: result.expires_at
      });
    }
  };

  const handleDownloadFile = async (url: string) => {
    if (generatedPack) {
      await trackDownload(generatedPack.pack_id);
    }
    window.open(url, "_blank");
  };

  const handleDownloadAll = async () => {
    if (!generatedPack) return;
    await trackDownload(generatedPack.pack_id);
    
    // Download all files
    for (const file of generatedPack.files) {
      window.open(file.url, "_blank");
    }
  };

  const handleClose = () => {
    setGeneratedPack(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Generate Document Pack
          </DialogTitle>
          <DialogDescription>
            Create a downloadable pack of documents for this stage
          </DialogDescription>
        </DialogHeader>

        {!generatedPack ? (
          <>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="packName">Pack Name</Label>
                <Input
                  id="packName"
                  value={packName}
                  onChange={e => setPackName(e.target.value)}
                  placeholder="Enter pack name..."
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Select Documents</Label>
                  <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                    {selectedDocIds.length === availableDocuments.length ? "Deselect All" : "Select All"}
                  </Button>
                </div>

                <div className="border rounded-md max-h-60 overflow-y-auto">
                  {availableDocuments.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground text-center">
                      No documents with files available
                    </p>
                  ) : (
                    <div className="divide-y">
                      {availableDocuments.map(doc => (
                        <label
                          key={doc.id}
                          className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                        >
                          <Checkbox
                            checked={selectedDocIds.includes(doc.id)}
                            onCheckedChange={() => handleToggleDocument(doc.id)}
                          />
                          <span className="text-sm flex-1">{doc.name}</span>
                          {doc.current_published_version_id && (
                            <Badge variant="outline" className="text-xs">Published</Badge>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {documents.length > availableDocuments.length && (
                  <p className="text-xs text-muted-foreground">
                    {documents.length - availableDocuments.length} document(s) excluded (no file attached)
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={generating || selectedDocIds.length === 0}
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Package className="h-4 w-4 mr-2" />
                    Generate Pack ({selectedDocIds.length})
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">Pack Generated Successfully</span>
              </div>

              <div className="text-sm text-muted-foreground">
                Expires: {new Date(generatedPack.expires_at).toLocaleDateString()}
              </div>

              <div className="border rounded-md max-h-60 overflow-y-auto">
                <div className="divide-y">
                  {generatedPack.files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3"
                    >
                      <span className="text-sm truncate flex-1">{file.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownloadFile(file.url)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button onClick={handleDownloadAll}>
                <Download className="h-4 w-4 mr-2" />
                Download All ({generatedPack.files.length})
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
