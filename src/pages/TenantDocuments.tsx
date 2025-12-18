import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, FileText, Download, Calendar, Trash2, GripVertical, CheckCircle2, XCircle, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CreateDocumentDialog2 } from "@/components/CreateDocumentDialog2";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

interface Document {
  id: number;
  title: string;
  description: string | null;
  uploaded_files: string[] | null;
  package_id: number | null;
  stage: number | null;
  is_released: boolean | null;
  category: string | null;
  createdat: string | null;
  isclientdoc: boolean | null;
  package_name?: string | null;
}

export default function TenantDocuments() {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [tenantName, setTenantName] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [packageId, setPackageId] = useState<number | null>(null);
  const [filesDialogOpen, setFilesDialogOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  // Get packageId from URL params if provided
  const urlPackageId = searchParams.get('packageId');

  useEffect(() => {
    fetchData();
  }, [tenantId, urlPackageId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch tenant info and package_ids
      const { data: tenantData } = await supabase
        .from("tenants")
        .select("name, package_id, package_ids")
        .eq("id", parseInt(tenantId!))
        .single();

      if (tenantData) {
        setTenantName(tenantData.name);
        
        // Use all package_ids for querying released documents
        const tenantPackageIds = (tenantData as any).package_ids || (tenantData.package_id ? [tenantData.package_id] : []);
        setPackageId(tenantData.package_id);
        
        // Fetch documents from documents table matching any of the tenant's package_ids (only released documents)
        if (tenantPackageIds.length > 0) {
          const { data: documentsData, error } = await supabase
            .from("documents")
            .select("*, packages:package_id(name)")
            .in("package_id", tenantPackageIds)
            .eq("is_released", true)
            .order("createdat", { ascending: false });

          if (error) throw error;
          
          // Map package name from joined data
          const docsWithPackage = (documentsData || []).map((doc: any) => ({
            ...doc,
            package_name: doc.packages?.name || null
          }));
          
          setDocuments(docsWithPackage);
        }
      }
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error",
        description: "Failed to load documents",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (documentId: number) => {
    try {
      const { error } = await supabase
        .from("documents")
        .delete()
        .eq("id", documentId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Document deleted successfully"
      });

      fetchData();
    } catch (error: any) {
      console.error("Error deleting document:", error);
      toast({
        title: "Error",
        description: "Failed to delete document",
        variant: "destructive"
      });
    }
  };

  const filteredDocuments = documents.filter(doc =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRowClick = (doc: Document) => {
    // Navigate to tenant document detail page with packageId
    navigate(`/tenant/${tenantId}/document/${doc.id}${packageId ? `?packageId=${packageId}` : ''}`);
  };

  const handleDownload = async (filePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { data, error } = await supabase.storage
        .from('package-documents')
        .download(filePath);
      
      if (error) throw error;
      
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filePath.split('/').pop() || 'document';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Success",
        description: "Document downloaded successfully"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to download document",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Back Button */}
      <Button variant="ghost" onClick={() => navigate(`/tenant/${tenantId}`)} className="gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black" style={{
        boxShadow: "var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)",
        border: "1px solid #00000052"
      }}>
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold">Documents</h1>
          <p className="text-sm text-muted-foreground">{tenantName}</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground/60" />
          <Input
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 bg-card border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-lg font-medium placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border-0 bg-card shadow-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b-2 hover:bg-transparent">
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r w-16">#</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r min-w-[200px]">Document Name</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r min-w-[250px]">Description</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r w-32">Category</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r w-40">Package</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r w-24">Released</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r min-w-[180px]">Files</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r w-32">Created</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-16 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filteredDocuments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-16 text-muted-foreground">
                  No documents found
                </TableCell>
              </TableRow>
            ) : (
              filteredDocuments.map((doc, index) => (
                <TableRow 
                  key={doc.id}
                  onClick={() => handleRowClick(doc)}
                  className="group hover:bg-primary/5 transition-all duration-200 cursor-pointer border-b border-border/50 hover:border-primary/20 animate-fade-in"
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <TableCell className="py-6 border-r border-border/50">
                    <span className="font-semibold text-foreground">{index + 1}</span>
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="font-semibold text-foreground">{doc.title}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50 whitespace-nowrap text-muted-foreground text-sm">
                    <div className="truncate max-w-[230px]">{doc.description || "—"}</div>
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50 whitespace-nowrap">
                    {doc.category ? (
                      <Badge variant="default" className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border border-blue-600 text-[0.75rem] py-[2px] px-[0.625rem] rounded-[11px]">
                        <Tag className="mr-1 h-3 w-3" />
                        {doc.category}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50 whitespace-nowrap">
                    {doc.package_name ? (
                      <Badge variant="outline" className="text-xs font-medium py-[3px] rounded-[9px] whitespace-nowrap">
                        {doc.package_name}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50 text-center">
                    {doc.is_released ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto" />
                    ) : (
                      <XCircle className="h-5 w-5 text-muted-foreground mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50 whitespace-nowrap">
                    {doc.uploaded_files && doc.uploaded_files.length > 0 ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFiles(doc.uploaded_files || []);
                          setFilesDialogOpen(true);
                        }}
                        className="text-xs whitespace-nowrap hover:bg-[hsl(196deg_100%_93.53%/79%)] hover:text-black [&:hover_svg]:text-black"
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        View Files ({doc.uploaded_files.length})
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-sm">No files</span>
                    )}
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50 text-muted-foreground text-sm whitespace-nowrap">
                    {doc.createdat ? new Date(doc.createdat).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    }) : '—'}
                  </TableCell>
                  <TableCell className="py-6">
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDocument(doc);
                          setEditDialogOpen(true);
                        }}
                        className="hover:bg-primary/10 text-xs"
                      >
                        Edit
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(doc.id);
                        }}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CreateDocumentDialog2
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={() => {
          fetchData();
          setSelectedDocument(null);
        }}
        packageId={packageId || undefined}
        stageId={selectedDocument?.stage_id}
        editDocument={selectedDocument}
      />

      <Dialog open={filesDialogOpen} onOpenChange={setFilesDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Document Files</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {selectedFiles.map((filePath, i) => {
              const fileName = filePath.split('/').pop() || `file-${i + 1}`;
              return (
                <div key={i}>
                  {i > 0 && <Separator className="my-2" />}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownload(filePath, new MouseEvent('click') as any)}
                    className="w-full justify-start h-auto py-2 px-3 text-sm hover:bg-primary/10"
                  >
                    <Download className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span className="truncate">{fileName}</span>
                  </Button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
