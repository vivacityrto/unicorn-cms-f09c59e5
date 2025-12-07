import { useState } from "react";
import { Dialog, DialogPortal, DialogOverlay, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AddDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  packageId?: number;
  stageId?: number;
}

export function AddDocumentDialog({ open, onOpenChange, onSuccess, packageId, stageId }: AddDocumentDialogProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    document_name: "",
    description: "",
    file_type: "",
    is_client_doc: false,
    is_active: true
  });

  const handleSave = async () => {
    if (!formData.document_name.trim()) {
      toast({
        title: "Validation Error",
        description: "Document name is required",
        variant: "destructive"
      });
      return;
    }

    if (!packageId || !stageId) {
      toast({
        title: "Error",
        description: "Package and stage must be selected for this document",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      const { error } = await supabase
        .from('package_documents')
        .insert({
          package_id: packageId,
          stage_id: stageId,
          document_name: formData.document_name,
          description: formData.description || null,
          file_type: formData.file_type || null,
          is_client_doc: formData.is_client_doc,
          is_active: formData.is_active,
          order_number: 0
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Document created successfully"
      });

      // Reset form
      setFormData({
        document_name: "",
        description: "",
        file_type: "",
        is_client_doc: false,
        is_active: true
      });
      
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create document",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="z-[70] bg-black/70" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-[70] flex flex-col w-full sm:max-w-[850px] max-w-[90vw] max-h-[80vh] translate-x-[-50%] translate-y-[-50%] gap-4 border-[3px] border-[#dfdfdf] bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg"
          )}
        >
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Create New Document
            </DialogTitle>
            <DialogDescription>
              Add a new document to this stage
            </DialogDescription>
          </DialogHeader>

        <div className="overflow-y-auto scrollbar-hide flex-1 space-y-4 py-4 min-h-0">
          {/* Document Name */}
          <div className="space-y-2">
            <Label htmlFor="document-name">Document Name</Label>
            <Input
              id="document-name"
              value={formData.document_name}
              onChange={(e) => setFormData({ ...formData, document_name: e.target.value })}
              placeholder="Enter document name"
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="document-description">Description</Label>
            <Textarea
              id="document-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Enter description"
              rows={4}
              className="resize-none"
            />
          </div>

          {/* File Type */}
          <div className="space-y-2">
            <Label htmlFor="document-file-type">File Type</Label>
            <Input
              id="document-file-type"
              value={formData.file_type}
              onChange={(e) => setFormData({ ...formData, file_type: e.target.value })}
              placeholder="e.g., PDF, Word, Excel"
            />
          </div>

          {/* Client Document */}
          <div className="flex items-center justify-between space-y-0">
            <Label htmlFor="document-client-doc" className="flex flex-col space-y-1">
              <span>Client Document</span>
              <span className="text-xs font-normal text-muted-foreground">
                Mark if this document is for the client
              </span>
            </Label>
            <Switch
              id="document-client-doc"
              checked={formData.is_client_doc}
              onCheckedChange={(checked) => setFormData({ ...formData, is_client_doc: checked })}
            />
          </div>

          {/* Active Status */}
          <div className="flex items-center justify-between space-y-0">
            <Label htmlFor="document-active" className="flex flex-col space-y-1">
              <span>Active Status</span>
              <span className="text-xs font-normal text-muted-foreground">
                Set whether this document is active and available for use
              </span>
            </Label>
            <Switch
              id="document-active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="hover:bg-[#40c6e524] hover:text-black"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading || !formData.document_name.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Create Document
              </>
            )}
          </Button>
        </DialogFooter>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
