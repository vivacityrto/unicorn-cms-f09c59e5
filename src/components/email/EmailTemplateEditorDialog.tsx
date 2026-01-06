import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Eye, Send, Save, Info } from "lucide-react";
import { EmailTemplate, useEmailSending } from "@/hooks/useEmailTemplates";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface EmailTemplateEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: EmailTemplate | null;
  onSave: (template: Partial<EmailTemplate>) => Promise<void>;
  isNew?: boolean;
}

const MERGE_FIELDS = [
  { field: "ClientName", description: "Tenant/Client name" },
  { field: "RTOName", description: "RTO name" },
  { field: "TradingName", description: "Trading name" },
  { field: "LegalName", description: "Legal entity name" },
  { field: "ABN", description: "Australian Business Number" },
  { field: "PackageName", description: "Package name (if context)" },
  { field: "PackageCode", description: "Package code" },
  { field: "StageName", description: "Stage name (if context)" },
  { field: "CSCName", description: "Assigned CSC name" },
  { field: "CSCEmail", description: "Assigned CSC email" },
];

export default function EmailTemplateEditorDialog({
  open,
  onOpenChange,
  template,
  onSave,
  isNew = false,
}: EmailTemplateEditorDialogProps) {
  const [formData, setFormData] = useState({
    internal_name: "",
    subject: "",
    html_body: "",
    description: "",
    status: "draft",
  });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("edit");
  const [previewHtml, setPreviewHtml] = useState("");
  const { previewEmail, testSendToMe, sending } = useEmailSending();

  useEffect(() => {
    if (template) {
      setFormData({
        internal_name: template.internal_name || "",
        subject: template.subject || "",
        html_body: template.html_body || "",
        description: template.description || "",
        status: template.status || "draft",
      });
    } else {
      setFormData({
        internal_name: "",
        subject: "",
        html_body: "",
        description: "",
        status: "draft",
      });
    }
    setActiveTab("edit");
  }, [template, open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(formData);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    // Generate sample preview with placeholder data
    let rendered = formData.html_body;
    MERGE_FIELDS.forEach(({ field }) => {
      rendered = rendered.replace(
        new RegExp(`\\{\\{${field}\\}\\}`, "g"),
        `<span style="background: #fef3c7; padding: 2px 4px; border-radius: 3px;">[${field}]</span>`
      );
    });
    setPreviewHtml(rendered);
    setActiveTab("preview");
  };

  const handleTestSend = async () => {
    if (!template?.id) {
      alert("Please save the template first before testing.");
      return;
    }
    
    try {
      // Use tenant_id 1 as sample for testing
      await testSendToMe({
        tenant_id: 1,
        email_template_id: template.id,
      });
    } catch (e) {
      // Error already handled by hook
    }
  };

  const insertMergeField = (field: string) => {
    const textarea = document.getElementById("html_body") as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = formData.html_body;
      const before = text.substring(0, start);
      const after = text.substring(end);
      const newText = `${before}{{${field}}}${after}`;
      setFormData({ ...formData, html_body: newText });
    } else {
      setFormData({ ...formData, html_body: formData.html_body + `{{${field}}}` });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-500/10 text-green-600 border-green-600";
      case "draft": return "bg-yellow-500/10 text-yellow-600 border-yellow-600";
      case "archived": return "bg-gray-500/10 text-gray-600 border-gray-600";
      default: return "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {isNew ? "Create Email Template" : "Edit Email Template"}
            {template && (
              <Badge variant="outline" className={getStatusColor(formData.status)}>
                {formData.status}
              </Badge>
            )}
            {template && (
              <span className="text-sm font-normal text-muted-foreground">
                Version {template.version}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="merge-fields">Merge Fields</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto mt-4">
            <TabsContent value="edit" className="space-y-4 mt-0">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="internal_name">Template Name</Label>
                  <Input
                    id="internal_name"
                    value={formData.internal_name}
                    onChange={(e) => setFormData({ ...formData, internal_name: e.target.value })}
                    placeholder="e.g., Welcome to Vivacity"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (internal use)</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of when this email is used"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Subject Line</Label>
                <Input
                  id="subject"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="e.g., Welcome to Vivacity – Let's get started"
                />
                <p className="text-xs text-muted-foreground">
                  Use {"{{FieldName}}"} for merge fields
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="html_body">Email Body (HTML)</Label>
                <Textarea
                  id="html_body"
                  value={formData.html_body}
                  onChange={(e) => setFormData({ ...formData, html_body: e.target.value })}
                  placeholder="<p>Hello {{ClientName}},</p>..."
                  className="min-h-[300px] font-mono text-sm"
                />
              </div>
            </TabsContent>

            <TabsContent value="preview" className="mt-0">
              <Card>
                <CardContent className="pt-4">
                  <div className="mb-4 p-3 bg-muted rounded-lg">
                    <p className="text-sm font-medium">Subject: {formData.subject}</p>
                  </div>
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: previewHtml || formData.html_body }}
                  />
                </CardContent>
              </Card>
              <p className="text-xs text-muted-foreground mt-2">
                Merge fields are highlighted. Actual values will be filled at send time.
              </p>
            </TabsContent>

            <TabsContent value="merge-fields" className="mt-0">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground mb-4">
                    Click a field to insert it at the cursor position in the body.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {MERGE_FIELDS.map(({ field, description }) => (
                      <TooltipProvider key={field}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="justify-start font-mono text-xs"
                              onClick={() => {
                                insertMergeField(field);
                                setActiveTab("edit");
                              }}
                            >
                              {`{{${field}}}`}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="flex-shrink-0 gap-2 pt-4 border-t">
          <div className="flex-1 flex gap-2">
            <Button variant="outline" onClick={handlePreview}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            {template?.id && template.status === "active" && (
              <Button
                variant="outline"
                onClick={handleTestSend}
                disabled={sending}
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Test Send to Me
              </Button>
            )}
          </div>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {isNew ? "Create" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
