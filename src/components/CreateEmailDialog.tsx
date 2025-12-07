import { useState, useEffect, useRef } from "react";
import { Dialog, DialogPortal, DialogOverlay, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Upload, X, FileText, Mail, Loader2, Bold, Italic, Underline, Strikethrough, List, ListOrdered, Undo, Send } from "lucide-react";
import { cn } from "@/lib/utils";

type EmailRow = {
  id: number;
  name: string | null;
  description: string | null;
  to: string | null;
  subject: string | null;
  content: string | null;
  order_number: number;
  package_id: number | null;
  automation_enabled: boolean | null;
  files?: string[] | null;
  created_at?: string | null;
};

interface CreateEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingEmail: EmailRow | null;
  onSuccess: () => void;
  totalEmails: number;
  isTemplate?: boolean;
}

export default function CreateEmailDialog({
  open,
  onOpenChange,
  editingEmail,
  onSuccess,
  totalEmails,
  isTemplate = false,
}: CreateEmailDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    to: "",
    subject: "",
    content: "",
  });
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; path: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingEmail) {
      setFormData({
        name: editingEmail.name || "",
        description: editingEmail.description || "",
        to: editingEmail.to || "",
        subject: editingEmail.subject || "",
        content: editingEmail.content || "",
      });
      if (editingEmail.files && editingEmail.files.length > 0) {
        setUploadedFiles(editingEmail.files.map(path => ({
          name: path.split('/').pop() || path,
          path: path
        })));
      } else {
        setUploadedFiles([]);
      }
    } else {
      setFormData({
        name: "",
        description: "",
        to: "",
        subject: "",
        content: "",
      });
      setUploadedFiles([]);
    }
  }, [editingEmail, open]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const newFiles: { name: string; path: string }[] = [];
      
      for (const file of Array.from(files)) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `emails/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('email-files')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        newFiles.push({
          name: file.name,
          path: filePath
        });
      }

      setUploadedFiles(prev => [...prev, ...newFiles]);
      toast({
        title: "Success",
        description: `${files.length} file(s) uploaded successfully`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to upload files",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveFile = async (index: number) => {
    const file = uploadedFiles[index];
    
    try {
      const { error } = await supabase.storage
        .from('email-files')
        .remove([file.path]);

      if (error) throw error;

      setUploadedFiles(prev => prev.filter((_, i) => i !== index));
      toast({
        title: "Success",
        description: "File removed successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to remove file",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const filePaths = uploadedFiles.map(f => f.path);

      if (isTemplate) {
        if (editingEmail) {
          const { error } = await supabase
            .from("email_templates_custom")
            .update({
              name: formData.name,
              description: formData.description || null,
              subject: formData.subject || null,
              content: formData.content || null,
            })
            .eq("id", editingEmail.id);

          if (error) throw error;

          toast({
            title: "Success",
            description: "Template updated successfully",
          });
        } else {
          const { error } = await supabase
            .from("email_templates_custom")
            .insert({
              name: formData.name,
              description: formData.description || null,
              subject: formData.subject || null,
              content: formData.content || null,
            });

          if (error) throw error;

          toast({
            title: "Success",
            description: "Template created successfully",
          });
        }
      } else {
        const { data: { user } } = await supabase.auth.getUser();

        if (editingEmail) {
          const { error } = await supabase
            .from("emails")
            .update({
              name: formData.name,
              description: formData.description || null,
              to: formData.to || null,
              subject: formData.subject || null,
              content: formData.content || null,
              files: filePaths,
            } as any)
            .eq("id", editingEmail.id);

          if (error) throw error;

          toast({
            title: "Success",
            description: "Email updated successfully",
          });
        } else {
          const { error } = await supabase
            .from("emails")
            .insert({
              name: formData.name,
              description: formData.description || null,
              to: formData.to || null,
              subject: formData.subject || null,
              content: formData.content || null,
              order_number: totalEmails + 1,
              auth_mode: false,
              files: filePaths,
              created_by: user?.id || null,
              created_at: new Date().toISOString(),
            } as any);

          if (error) throw error;

          toast({
            title: "Success",
            description: "Email created successfully",
          });
        }
      }

      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message ?? `Failed to save ${isTemplate ? 'template' : 'email'}`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const dialogTitle = isTemplate 
    ? (editingEmail ? "Edit Template" : "New Template")
    : (editingEmail ? "Edit Email" : "Create Email");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="z-[70] bg-black/70" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-[70] flex flex-col w-full sm:max-w-[650px] max-w-[90vw] max-h-[85vh] translate-x-[-50%] translate-y-[-50%] border-[3px] border-[#dfdfdf] bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg"
          )}
        >
          <DialogHeader className="flex-shrink-0 pb-4">
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              {dialogTitle}
            </DialogTitle>
            <DialogDescription>
              {editingEmail ? 'Update email details and content' : 'Create a new email with attachments'}
            </DialogDescription>
          </DialogHeader>

          {!isTemplate && editingEmail && editingEmail.package_id && (
            <Alert className="bg-amber-50 border-amber-200 mb-4 flex-shrink-0">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                <strong>Warning!</strong> This email appears in more than one package. Changes made here will affect all packages where this email appears.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter email name"
                autoFocus
              />
            </div>

            {/* Description with formatting toolbar */}
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <div className="border border-input rounded-md overflow-hidden bg-background">
                {/* Formatting Toolbar */}
                <div className="flex items-center gap-1 border-b border-border/50 bg-muted/30 px-2 py-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => {
                      e.preventDefault();
                      document.execCommand('bold');
                    }}
                  >
                    <Bold className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => {
                      e.preventDefault();
                      document.execCommand('italic');
                    }}
                  >
                    <Italic className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => {
                      e.preventDefault();
                      document.execCommand('underline');
                    }}
                  >
                    <Underline className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => {
                      e.preventDefault();
                      document.execCommand('strikeThrough');
                    }}
                  >
                    <Strikethrough className="h-3.5 w-3.5" />
                  </Button>
                  <div className="w-px h-5 bg-border/50 mx-1" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => {
                      e.preventDefault();
                      document.execCommand('insertUnorderedList');
                    }}
                  >
                    <List className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => {
                      e.preventDefault();
                      document.execCommand('insertOrderedList');
                    }}
                  >
                    <ListOrdered className="h-3.5 w-3.5" />
                  </Button>
                  <div className="w-px h-5 bg-border/50 mx-1" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => {
                      e.preventDefault();
                      document.execCommand('undo');
                    }}
                  >
                    <Undo className="h-3.5 w-3.5" />
                  </Button>
                </div>
                
                {/* Text Area */}
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter description"
                  rows={3}
                  className="resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
            </div>

            {!isTemplate && (
              <div className="space-y-1.5">
                <Label htmlFor="to">To</Label>
                <Input
                  id="to"
                  value={formData.to}
                  onChange={(e) => setFormData(prev => ({ ...prev, to: e.target.value }))}
                  placeholder="recipient@email.com"
                />
                <p className="text-xs text-muted-foreground">
                  If empty, the email will be addressed to the client.
                </p>
              </div>
            )}

            {/* Subject */}
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={formData.subject}
                onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="Enter subject"
              />
            </div>

            {/* Content with formatting toolbar */}
            <div className="space-y-1.5">
              <Label htmlFor="content">Content</Label>
              <div className="border border-input rounded-md overflow-hidden bg-background">
                {/* Formatting Toolbar */}
                <div className="flex items-center gap-1 border-b border-border/50 bg-muted/30 px-2 py-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => {
                      e.preventDefault();
                      document.execCommand('bold');
                    }}
                  >
                    <Bold className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => {
                      e.preventDefault();
                      document.execCommand('italic');
                    }}
                  >
                    <Italic className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => {
                      e.preventDefault();
                      document.execCommand('underline');
                    }}
                  >
                    <Underline className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => {
                      e.preventDefault();
                      document.execCommand('strikeThrough');
                    }}
                  >
                    <Strikethrough className="h-3.5 w-3.5" />
                  </Button>
                  <div className="w-px h-5 bg-border/50 mx-1" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => {
                      e.preventDefault();
                      document.execCommand('insertUnorderedList');
                    }}
                  >
                    <List className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => {
                      e.preventDefault();
                      document.execCommand('insertOrderedList');
                    }}
                  >
                    <ListOrdered className="h-3.5 w-3.5" />
                  </Button>
                  <div className="w-px h-5 bg-border/50 mx-1" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={(e) => {
                      e.preventDefault();
                      document.execCommand('undo');
                    }}
                  >
                    <Undo className="h-3.5 w-3.5" />
                  </Button>
                </div>
                
                {/* Text Area */}
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Enter email content"
                  rows={6}
                  className="resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
            </div>

            {/* Attachments */}
            {!isTemplate && (
              <div className="space-y-1.5">
                <Label>Attachments</Label>
                <div className="border border-input rounded-md">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                  >
                    <span className="text-sm text-muted-foreground">
                      {isUploading ? "Uploading..." : "Choose files"}
                    </span>
                    <div className="flex items-center gap-2">
                      {uploadedFiles.length > 0 && (
                        <span className="text-sm text-muted-foreground">{uploadedFiles.length} files</span>
                      )}
                      <Upload className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </label>
                </div>

                {uploadedFiles.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {uploadedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between border border-input rounded-md px-3 py-2"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm truncate">{file.name}</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveFile(index)}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive flex-shrink-0 ml-2"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )}
            </div>

          <DialogFooter className="gap-2 flex-shrink-0 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting || isUploading}
              className="hover:bg-[#40c6e524] hover:text-black"
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleSubmit()}
              disabled={isSubmitting || isUploading || !formData.name.trim()}
              className="bg-[hsl(188_74%_51%)] hover:bg-[hsl(188_74%_51%)]/90 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {editingEmail ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                editingEmail ? 'Update Email' : 'Create Email'
              )}
            </Button>
            {!isTemplate && (
              <Button 
                variant="outline"
                disabled={isSubmitting || isUploading}
                onClick={() => {
                  toast({
                    title: "Save & Send",
                    description: "Save & Send functionality coming soon",
                  });
                }}
                className="hover:bg-[#40c6e524] hover:text-black"
              >
                <Send className="mr-2 h-4 w-4" />
                Save & Send
              </Button>
            )}
          </DialogFooter>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
