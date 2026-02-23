import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, FileText, Download, Trash2, CheckCircle2, XCircle, Tag, AlertCircle, Loader2, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CreateDocumentDialog2 } from "@/components/CreateDocumentDialog2";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { MissingMergeFieldsDialog } from "@/components/tenant/MissingMergeFieldsDialog";
import { useMissingMergeFields, MissingField } from "@/hooks/useMissingMergeFields";
import { useExcelGeneration, isExcelDocument } from "@/hooks/useExcelGeneration";
import { useDocumentActivity } from "@/hooks/useDocumentActivity";

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
  merge_fields?: any;
  is_auto_generated?: boolean | null;
  format?: string | null;
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
  const [selectedFilesDoc, setSelectedFilesDoc] = useState<Document | null>(null);
  
  // Missing merge fields state
  const [missingFieldsDialogOpen, setMissingFieldsDialogOpen] = useState(false);
  const [selectedDocForMerge, setSelectedDocForMerge] = useState<Document | null>(null);
  const [missingFieldsList, setMissingFieldsList] = useState<MissingField[]>([]);
  const [documentMissingFields, setDocumentMissingFields] = useState<Record<number, MissingField[]>>({});
  const [checkingFields, setCheckingFields] = useState(false);

  const parsedTenantId = tenantId ? parseInt(tenantId) : null;
  const { detectMissingFields } = useMissingMergeFields(parsedTenantId);
  const { generateAndDownload, isDocumentGenerating, generating } = useExcelGeneration();
  const { logDownload } = useDocumentActivity();

  // Get packageId from URL params if provided
  const urlPackageId = searchParams.get('packageId');

  // Check missing fields for all documents after loading
  const checkAllMissingFields = useCallback(async (docs: Document[]) => {
    if (!parsedTenantId || docs.length === 0) return;
    
    setCheckingFields(true);
    const missingByDoc: Record<number, MissingField[]> = {};
    
    for (const doc of docs) {
      if (doc.is_auto_generated && doc.merge_fields) {
        // Extract merge field codes from document
        const docFieldCodes = Array.isArray(doc.merge_fields) 
          ? doc.merge_fields 
          : Object.keys(doc.merge_fields);
        
        if (docFieldCodes.length > 0) {
          const missing = await detectMissingFields(docFieldCodes);
          if (missing.length > 0) {
            missingByDoc[doc.id] = missing;
          }
        }
      }
    }
    
    setDocumentMissingFields(missingByDoc);
    setCheckingFields(false);
  }, [parsedTenantId, detectMissingFields]);

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
          const { data: documentsData, error } = await (supabase as any)
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
          
          // Check for missing merge fields in auto-generate documents
          checkAllMissingFields(docsWithPackage);
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

  const handleOpenMissingFields = (doc: Document, e: React.MouseEvent) => {
    e.stopPropagation();
    const missing = documentMissingFields[doc.id] || [];
    setSelectedDocForMerge(doc);
    setMissingFieldsList(missing);
    setMissingFieldsDialogOpen(true);
  };

  const handleMissingFieldsSuccess = () => {
    // Refresh documents and re-check missing fields
    fetchData();
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

  const handleDownload = async (filePath: string, doc: Document, e: React.MouseEvent) => {
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
      
      // Log download activity
      if (parsedTenantId) {
        logDownload({
          tenantId: parsedTenantId,
          clientId: parsedTenantId,
          packageId: doc.package_id || undefined,
          stageId: doc.stage || undefined,
          documentId: doc.id,
          fileName: doc.title || filePath.split('/').pop() || 'document',
          actorRole: 'tenant'
        });
      }
      
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

  // Handle Excel auto-generation download
  const handleExcelGenerate = async (doc: Document, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!parsedTenantId) {
      toast({
        title: "Error",
        description: "Tenant ID is required",
        variant: "destructive"
      });
      return;
    }

    // Check if there are missing fields first
    const hasMissingFields = documentMissingFields[doc.id]?.length > 0;
    if (hasMissingFields) {
      handleOpenMissingFields(doc, e);
      return;
    }

    // Get client_legacy_id from tenants table
    const { data: tenantData } = await supabase
      .from("tenants")
      .select("client_legacy_id")
      .eq("id", parsedTenantId)
      .single();

    await generateAndDownload({
      documentId: doc.id,
      tenantId: parsedTenantId,
      clientLegacyId: (tenantData as any)?.client_legacy_id,
      stageId: doc.stage || undefined,
      packageId: doc.package_id || undefined
    });
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
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r w-36">Status</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r min-w-[180px]">Files</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap border-r w-32">Created</TableHead>
              <TableHead className="font-semibold bg-muted/30 text-foreground h-14 whitespace-nowrap w-48">Actions</TableHead>
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
                  <TableCell className="py-6 border-r border-border/50 whitespace-nowrap">
                    {(() => {
                      const hasMissingFields = documentMissingFields[doc.id]?.length > 0;
                      if (checkingFields) {
                        return (
                          <Badge variant="secondary" className="text-xs">
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Checking...
                          </Badge>
                        );
                      }
                      if (hasMissingFields) {
                        return (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500 text-xs">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Pending Info
                          </Badge>
                        );
                      }
                      return (
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500 text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Ready
                        </Badge>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="py-6 border-r border-border/50 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {/* Excel auto-generate button */}
                      {doc.is_auto_generated && isExcelDocument(doc.format) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => handleExcelGenerate(doc, e)}
                          disabled={isDocumentGenerating(doc.id) || documentMissingFields[doc.id]?.length > 0}
                          className="text-xs whitespace-nowrap bg-green-500/10 text-green-600 border-green-500 hover:bg-green-500/20"
                        >
                          {isDocumentGenerating(doc.id) ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <FileSpreadsheet className="h-3 w-3 mr-1" />
                              Generate Excel
                            </>
                          )}
                        </Button>
                      )}
                      {/* Regular file view button */}
                      {doc.uploaded_files && doc.uploaded_files.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFiles(doc.uploaded_files || []);
                            setSelectedFilesDoc(doc);
                            setFilesDialogOpen(true);
                          }}
                          className="text-xs whitespace-nowrap hover:bg-[hsl(196deg_100%_93.53%/79%)] hover:text-black [&:hover_svg]:text-black"
                        >
                          <FileText className="h-3 w-3 mr-1" />
                          View Files ({doc.uploaded_files.length})
                        </Button>
                      )}
                      {!doc.uploaded_files?.length && !(doc.is_auto_generated && isExcelDocument(doc.format)) && (
                        <span className="text-muted-foreground text-sm">No files</span>
                      )}
                    </div>
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
                      {documentMissingFields[doc.id]?.length > 0 && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={(e) => handleOpenMissingFields(doc, e)}
                          className="text-xs bg-amber-500/10 text-amber-600 border-amber-500 hover:bg-amber-500/20"
                        >
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Provide Info
                        </Button>
                      )}
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
                      onClick={(e) => {
                        if (selectedFilesDoc) {
                          handleDownload(filePath, selectedFilesDoc, e);
                        }
                      }}
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

      {/* Missing Merge Fields Dialog */}
      {parsedTenantId && selectedDocForMerge && (
        <MissingMergeFieldsDialog
          open={missingFieldsDialogOpen}
          onOpenChange={setMissingFieldsDialogOpen}
          tenantId={parsedTenantId}
          documentName={selectedDocForMerge.title}
          documentId={selectedDocForMerge.id}
          stageId={selectedDocForMerge.stage || undefined}
          packageId={selectedDocForMerge.package_id || undefined}
          missingFields={missingFieldsList}
          onSuccess={handleMissingFieldsSuccess}
        />
      )}
    </div>
  );
}
