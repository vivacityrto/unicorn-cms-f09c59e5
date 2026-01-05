import { useState, useEffect } from "react";
import { Dialog, DialogPortal, DialogOverlay, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Loader2, X, Upload, Calendar, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreateDocumentDialog2Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  packageId?: number;
  stageId?: number;
  editDocument?: any;
  tenantId?: number;
}

export function CreateDocumentDialog2({ open, onOpenChange, onSuccess, packageId, stageId, editDocument, tenantId }: CreateDocumentDialog2Props) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [formData, setFormData] = useState({
    document_name: "",
    description: "",
    watermark: false,
    release_to_client: false,
    category_id: null as number | null,
    is_active: true
  });
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      fetchCategories();
    }
  }, [open]);

  // Separate effect to populate form when editDocument or categories change
  useEffect(() => {
    if (open && editDocument) {
      // Map category name to category ID
      const matchingCategory = categories.find(c => c.name === editDocument.category);
      setFormData({
        document_name: editDocument.title || "",
        description: editDocument.description || "",
        watermark: editDocument.watermark || false,
        release_to_client: editDocument.isclientdoc || editDocument.is_released || false,
        category_id: matchingCategory?.id || null,
        is_active: editDocument.is_active !== undefined ? editDocument.is_active : true
      });
      setExistingFiles(editDocument.uploaded_files || []);
      setUploadedFiles([]);
    } else if (open && !editDocument) {
      // Reset form for new document
      setFormData({
        document_name: "",
        description: "",
        watermark: false,
        release_to_client: false,
        category_id: null,
        is_active: true
      });
      setUploadedFiles([]);
      setExistingFiles([]);
    }
  }, [open, editDocument, categories]);

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('documents_categories')
        .select('id, name')
        .order('name');
      
      if (error) throw error;
      setCategories(data || []);
    } catch (error: any) {
      console.error('Error fetching categories:', error);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadedFiles(prev => [...prev, ...files]);
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeExistingFile = (index: number) => {
    setExistingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!formData.document_name.trim()) {
      toast({
        title: "Validation Error",
        description: "Document name is required",
        variant: "destructive"
      });
      return;
    }

    if (!packageId) {
      toast({
        title: "Error",
        description: "Package must be selected for this document",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      
      // Upload files in parallel for much faster performance
      const fileUrls: string[] = [...existingFiles];
      if (uploadedFiles.length > 0) {
        const timestamp = Date.now();
        const folderPath = stageId 
          ? `package_${packageId}/stage_${stageId}` 
          : `package_${packageId}/client_${tenantId || 'general'}`;
        const uploadPromises = uploadedFiles.map((file, index) => {
          const filePath = `${folderPath}/${timestamp}_${index}_${file.name}`;
          return supabase.storage
            .from('package-documents')
            .upload(filePath, file, {
              cacheControl: '3600',
              upsert: false
            })
            .then(result => {
              if (result.error) {
                throw new Error(`Failed to upload ${file.name}: ${result.error.message}`);
              }
              return filePath;
            });
        });
        
        const uploadedPaths = await Promise.all(uploadPromises);
        fileUrls.push(...uploadedPaths);
      }

      // Get category name from ID
      const categoryName = formData.category_id 
        ? categories.find(c => c.id === formData.category_id)?.name || null
        : null;

      // Store document in public.documents table
      const documentData = {
        title: formData.document_name,
        description: formData.description || null,
        format: uploadedFiles.length > 0 ? uploadedFiles.map(f => f.name.split('.').pop()).join(', ') : null,
        isclientdoc: formData.release_to_client,
        is_released: formData.release_to_client,
        watermark: formData.watermark,
        stage: stageId || null,
        package_id: packageId,
        tenant_id: tenantId || null,
        category: categoryName,
        uploaded_files: fileUrls.length > 0 ? fileUrls : null,
        file_names: uploadedFiles.length > 0 ? uploadedFiles.map(f => f.name) : (editDocument?.file_names || null),
      };

      let error;
      if (editDocument) {
        // Update existing document in public.documents
        const result = await supabase
          .from('documents')
          .update(documentData)
          .eq('id', editDocument.id);
        error = result.error;
      } else {
        // Insert new document into public.documents
        const result = await supabase
          .from('documents')
          .insert(documentData);
        error = result.error;
      }

      if (error) throw error;

      toast({
        title: "Success",
        description: editDocument ? "Document updated successfully" : "Document created successfully"
      });

      // Reset form
      setFormData({
        document_name: "",
        description: "",
        watermark: false,
        release_to_client: false,
        category_id: null,
        is_active: true
      });
      setUploadedFiles([]);
      
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
          id="createdocument2"
          className={cn(
            "fixed left-[50%] top-[50%] z-[70] flex flex-col w-full sm:max-w-[600px] max-w-[90vw] max-h-[85vh] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-hidden scrollbar-hide border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
          )}
        >
          <DialogHeader>
            <div className="flex items-start justify-between">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {editDocument ? "Edit Document" : "New Document"}
              </DialogTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>
                  {editDocument?.created_at 
                    ? new Date(editDocument.created_at).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric'
                      })
                    : new Date().toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric'
                      })
                  }
                </span>
              </div>
            </div>
            <DialogDescription>
              {editDocument ? "Update document details" : "Add a new document to this stage"}
            </DialogDescription>
          </DialogHeader>

          <Separator />

        <div className="overflow-y-auto scrollbar-hide flex-1 space-y-6 py-4 px-1">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="document-name-2">Name</Label>
            <Input
              id="document-name-2"
              value={formData.document_name}
              onChange={(e) => setFormData({ ...formData, document_name: e.target.value })}
              placeholder="Policy"
              autoFocus
              className="focus:z-10"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="document-description-2">Description</Label>
            <Textarea
              id="document-description-2"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Enter description"
              rows={6}
              className="resize-none focus:z-10"
            />
          </div>

          <Separator className="my-1" />

          {/* Template File Upload */}
          <div className="space-y-2">
            <Label htmlFor="document-files-2">Template</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('document-files-2')?.click()}
                  className="focus:z-10"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Choose File
                </Button>
                <Input
                  id="document-files-2"
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
              
              {/* Existing files */}
              {existingFiles.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Existing Files</Label>
                  {existingFiles.map((filePath, index) => {
                    const fileName = filePath.split('/').pop() || `file-${index + 1}`;
                    const handleViewFile = () => {
                      const { data } = supabase.storage.from('package-documents').getPublicUrl(filePath);
                      if (data?.publicUrl) {
                        window.open(data.publicUrl, '_blank');
                      }
                    };
                    return (
                      <div key={`existing-${index}`} className="flex items-center justify-between bg-blue-50 dark:bg-blue-950/20 p-2 rounded-md text-sm border border-blue-200 dark:border-blue-800">
                        <span className="truncate flex-1">{fileName}</span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={handleViewFile}
                            className="h-6 w-6 p-0 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeExistingFile(index)}
                            className="h-6 w-6 p-0 hover:bg-destructive/10"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Newly uploaded files */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-2">
                  {existingFiles.length > 0 && (
                    <Label className="text-xs text-muted-foreground">New Files</Label>
                  )}
                  {uploadedFiles.map((file, index) => (
                    <div key={`new-${index}`} className="flex items-center justify-between bg-muted p-2 rounded-md text-sm">
                      <span className="truncate flex-1">{file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                        className="h-6 w-6 p-0 hover:bg-destructive/10"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Separator className="my-1" />

          {/* Checkboxes */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="document-watermark-2"
                checked={formData.watermark}
                onCheckedChange={(checked) => setFormData({ ...formData, watermark: checked as boolean })}
                className="focus:z-10"
              />
              <Label htmlFor="document-watermark-2" className="text-sm font-normal cursor-pointer">
                Watermark document (e.g. for certificates)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="document-release-2"
                checked={formData.release_to_client}
                onCheckedChange={(checked) => setFormData({ ...formData, release_to_client: checked as boolean })}
                className="focus:z-10"
              />
              <Label htmlFor="document-release-2" className="text-sm font-normal cursor-pointer">
                Release document to client
              </Label>
            </div>
          </div>

          <Separator className="my-1" />

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="document-category-2">Category</Label>
            <Select 
              value={formData.category_id?.toString() || ""} 
              onValueChange={(value) => setFormData({ ...formData, category_id: value ? Number(value) : null })}
            >
              <SelectTrigger id="document-category-2" className="bg-background focus:z-10">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent className="bg-background z-[100]">
                {categories.length === 0 ? (
                  <SelectItem value="no-categories" disabled>No categories available</SelectItem>
                ) : (
                  categories.map((category) => (
                    <SelectItem key={category.id} value={category.id.toString()}>
                      {category.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator className="my-1" />

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="focus:z-10 hover:bg-[#40c6e524] hover:text-black"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading || !formData.document_name.trim()}
            className="focus:z-10"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                {editDocument ? "Update Document" : "Create Document"}
              </>
            )}
          </Button>
        </DialogFooter>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
