import { useState } from "react";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useHelpCenter } from "@/components/help-center";
import {
  usePortalDocuments,
  useUploadPortalDocument,
  useDownloadPortalDocument,
  type PortalDocument,
} from "@/hooks/usePortalDocuments";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, Eye, FileText, Loader2, MessageCircle, Inbox } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const CATEGORIES = ["Compliance", "Evidence", "Admin", "Other"];

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Inbox className="h-12 w-12 mb-3" style={{ color: "hsl(270 20% 88%)" }} />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function DocumentTable({
  docs,
  tenantId,
  onView,
}: {
  docs: PortalDocument[];
  tenantId: number;
  onView: (doc: PortalDocument) => void;
}) {
  const downloadMutation = useDownloadPortalDocument();

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: "hsl(270 20% 88%)" }}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="hidden sm:table-cell">Type</TableHead>
            <TableHead className="hidden md:table-cell">Uploaded by</TableHead>
            <TableHead className="hidden sm:table-cell">Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {docs.map((doc) => {
            const isVivacity = doc.direction === "vivacity_to_client";
            return (
              <TableRow key={doc.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 flex-shrink-0" style={{ color: "hsl(330 86% 51%)" }} />
                    <span className="truncate max-w-[200px]">{doc.file_name}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">
                  {doc.file_type?.split("/").pop()?.toUpperCase() || "—"}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Badge
                    variant="outline"
                    className="text-xs"
                    style={{
                      borderColor: isVivacity ? "hsl(270 55% 41%)" : "hsl(189 74% 50%)",
                      color: isVivacity ? "hsl(270 55% 41%)" : "hsl(189 74% 50%)",
                    }}
                  >
                    {isVivacity ? "Vivacity" : "Your team"}
                  </Badge>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">
                  {format(new Date(doc.created_at), "dd MMM yyyy")}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onView(doc)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => downloadMutation.mutate({ doc, tenantId })}
                      disabled={downloadMutation.isPending}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function ClientDocumentsPage() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [tab, setTab] = useState("shared");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("");

  const { activeTenantId, isReadOnly } = useClientTenant();
  const { openHelpCenter } = useHelpCenter();

  // Use existing portal_documents hooks with direction filter
  const shared = usePortalDocuments(activeTenantId, "vivacity_to_client");
  const uploaded = usePortalDocuments(activeTenantId, "client_to_vivacity");
  const uploadMutation = useUploadPortalDocument();

  // Filter shared tab to only client-visible docs
  const sharedDocs = (shared.data ?? []).filter((d) => d.is_client_visible);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !title) setTitle(f.name);
  };

  const resetForm = () => {
    setFile(null);
    setTitle("");
    setDescription("");
    setCategory("");
  };

  const handleUpload = () => {
    if (!file || !activeTenantId) return;
    uploadMutation.mutate(
      {
        tenantId: activeTenantId,
        file,
        direction: "client_to_vivacity",
        isClientVisible: true,
        tags: category ? [category] : undefined,
      },
      {
        onSuccess: () => {
          resetForm();
          setUploadOpen(false);
        },
      }
    );
  };

  const handleView = async (doc: PortalDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from("portal-documents")
        .createSignedUrl(doc.storage_path, 300);
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch {
      toast.error("Failed to open file");
    }
  };

  if (!activeTenantId) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">No tenant access</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "hsl(270 55% 41%)" }}>
            Documents
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Files shared between your organisation and Vivacity.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openHelpCenter("csc")}
            className="text-xs"
          >
            <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
            Request a document
          </Button>
          {!isReadOnly && (
            <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="text-xs font-medium"
                  style={{
                    backgroundColor: "hsl(189 74% 50%)",
                    color: "hsl(270 47% 26%)",
                  }}
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Upload document
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Upload document</DialogTitle>
                  <DialogDescription>
                    Upload a file to share with Vivacity. It will only be visible to your organisation and Vivacity staff.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div>
                    <Label htmlFor="file">File</Label>
                    <Input id="file" type="file" onChange={handleFileChange} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Document title"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description (optional)</Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Brief description…"
                      className="mt-1"
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Category (optional)</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { resetForm(); setUploadOpen(false); }}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleUpload}
                    disabled={!file || uploadMutation.isPending}
                    style={{
                      backgroundColor: "hsl(189 74% 50%)",
                      color: "hsl(270 47% 26%)",
                    }}
                  >
                    {uploadMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Upload
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="shared">Shared with you</TabsTrigger>
          <TabsTrigger value="uploaded">Uploaded by you</TabsTrigger>
        </TabsList>

        <TabsContent value="shared" className="mt-4">
          {shared.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !sharedDocs.length ? (
            <EmptyState message="No documents shared yet." />
          ) : (
            <DocumentTable docs={sharedDocs} tenantId={activeTenantId} onView={handleView} />
          )}
        </TabsContent>

        <TabsContent value="uploaded" className="mt-4">
          {uploaded.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !uploaded.data?.length ? (
            <EmptyState message="No documents uploaded yet." />
          ) : (
            <DocumentTable docs={uploaded.data} tenantId={activeTenantId} onView={handleView} />
          )}
        </TabsContent>
      </Tabs>

      {/* Package docs note */}
      <div className="rounded-lg border p-4 text-sm text-muted-foreground" style={{ borderColor: "hsl(270 20% 88%)" }}>
        <FileText className="h-4 w-4 inline mr-1.5" style={{ color: "hsl(270 55% 41%)" }} />
        Package documents are available within your package pages.
      </div>
    </div>
  );
}
