import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, Archive, Copy, FileText, Mail, Pencil, CheckCircle, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmailTemplates, EmailTemplate } from "@/hooks/useEmailTemplates";
import EmailTemplateEditorDialog from "@/components/email/EmailTemplateEditorDialog";

export default function ManageEmailTemplates() {
  const { toast } = useToast();
  const { templates, loading, createTemplate, updateTemplate, duplicateTemplate, archiveTemplate, activateTemplate } = useEmailTemplates();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [isNewTemplate, setIsNewTemplate] = useState(false);

  const handleCreate = () => {
    setSelectedTemplate(null);
    setIsNewTemplate(true);
    setEditorOpen(true);
  };

  const handleEdit = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    setIsNewTemplate(false);
    setEditorOpen(true);
  };

  const handleSave = async (data: Partial<EmailTemplate>) => {
    try {
      if (isNewTemplate) {
        await createTemplate(data);
        toast({ title: "Success", description: "Template created successfully" });
      } else if (selectedTemplate) {
        await updateTemplate(selectedTemplate.id, data);
        toast({ title: "Success", description: "Template updated successfully" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      throw e;
    }
  };

  const handleDuplicate = async (template: EmailTemplate) => {
    try {
      await duplicateTemplate(template.id);
      toast({ title: "Success", description: "Template duplicated successfully" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleArchive = async (template: EmailTemplate) => {
    try {
      await archiveTemplate(template.id);
      toast({ title: "Success", description: "Template archived" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleActivate = async (template: EmailTemplate) => {
    try {
      await activateTemplate(template.id);
      toast({ title: "Success", description: "Template activated" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const filteredTemplates = templates.filter((template) => {
    const matchesSearch =
      template.internal_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      template.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || template.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-green-500/10 text-green-600 border border-green-600">
            <CheckCircle className="h-3 w-3 mr-1" />
            Active
          </Badge>
        );
      case "draft":
        return (
          <Badge className="bg-yellow-500/10 text-yellow-600 border border-yellow-600">
            <Clock className="h-3 w-3 mr-1" />
            Draft
          </Badge>
        );
      case "archived":
        return (
          <Badge className="bg-gray-500/10 text-gray-600 border border-gray-600">
            <XCircle className="h-3 w-3 mr-1" />
            Archived
          </Badge>
        );
      default:
        return null;
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full animate-fade-in">
        <div className="flex-shrink-0 p-6 space-y-6 border-b bg-background">
          <div className="space-y-2">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-12 w-full max-w-md" />
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Sticky Header */}
      <div className="flex-shrink-0 p-6 space-y-6 border-b bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[28px] font-bold">Email Templates</h1>
            <p className="text-muted-foreground">Manage email templates for stage communications</p>
          </div>
          <Button onClick={handleCreate} className="bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-2" />
            Create Template
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-4 max-w-2xl">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-11"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto p-6">
        {filteredTemplates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Mail className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No templates found</p>
              <p className="text-sm text-muted-foreground">
                {searchTerm || statusFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Create your first email template"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border bg-card shadow-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-b-2 hover:bg-transparent">
                  <TableHead className="bg-muted/30 font-semibold h-14 min-w-[250px]">Name</TableHead>
                  <TableHead className="bg-muted/30 font-semibold h-14">Subject</TableHead>
                  <TableHead className="bg-muted/30 font-semibold h-14 text-center w-[100px]">Status</TableHead>
                  <TableHead className="bg-muted/30 font-semibold h-14 text-center w-[80px]">Version</TableHead>
                  <TableHead className="bg-muted/30 font-semibold h-14 w-[100px]">Updated</TableHead>
                  <TableHead className="bg-muted/30 font-semibold h-14 text-center w-[150px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTemplates.map((template, index) => (
                  <TableRow
                    key={template.id}
                    className={cn(
                      "group transition-all duration-200 cursor-pointer",
                      index % 2 === 0 ? "bg-background" : "bg-muted/20",
                      "hover:bg-primary/5"
                    )}
                    onClick={() => handleEdit(template)}
                  >
                    <TableCell className="py-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold">{template.internal_name}</span>
                        {template.description && (
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {template.description}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <span className="text-sm">{template.subject || "-"}</span>
                    </TableCell>
                    <TableCell className="py-4 text-center">{getStatusBadge(template.status)}</TableCell>
                    <TableCell className="py-4 text-center">
                      <Badge variant="outline">v{template.version}</Badge>
                    </TableCell>
                    <TableCell className="py-4 text-sm text-muted-foreground">
                      {formatDate(template.updated_at)}
                    </TableCell>
                    <TableCell className="py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleEdit(template)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleDuplicate(template)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Duplicate</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        {template.status === "draft" && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-green-600 hover:text-green-700"
                                  onClick={() => handleActivate(template)}
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Activate</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}

                        {template.status !== "archived" && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => handleArchive(template)}
                                >
                                  <Archive className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Archive</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Editor Dialog */}
      <EmailTemplateEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        template={selectedTemplate}
        onSave={handleSave}
        isNew={isNewTemplate}
      />
    </div>
  );
}
