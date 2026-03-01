import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText, Download, Calendar, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useDocumentActivity } from "@/hooks/useDocumentActivity";

interface PackageDocument {
  id: number;
  title: string;
  description: string | null;
  uploaded_files: string[] | null;
  category: string | null;
  createdat: string | null;
  updated_at: string | null;
  format: string | null;
  isclientdoc: boolean | null;
}

export default function TenantDocumentDetail() {
  const { tenantId, documentId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [docData, setDocData] = useState<PackageDocument | null>(null);
  const [tenantName, setTenantName] = useState("");
  const { logDownload } = useDocumentActivity();
  
  const parsedTenantId = tenantId ? parseInt(tenantId) : null;

  // Get packageId from URL params if provided
  const urlPackageId = searchParams.get('packageId');

  useEffect(() => {
    fetchData();
  }, [tenantId, documentId, urlPackageId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch tenant info
      const { data: tenantData } = await supabase
        .from("tenants")
        .select("name, package_id")
        .eq("id", parseInt(tenantId!))
        .single();

      if (tenantData) {
        setTenantName(tenantData.name);
        
        // Fetch the document
        const { data: packageDocData, error } = await supabase
          .from("documents")
          .select("*")
          .eq("id", parseInt(documentId!))
          .maybeSingle();

        if (error) throw error;
        setDocData(packageDocData as PackageDocument | null);
      }
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error",
        description: "Failed to load document",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (filePath: string) => {
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
      if (parsedTenantId && docData) {
        logDownload({
          tenantId: parsedTenantId,
          clientId: parsedTenantId,
          documentId: docData.id,
          fileName: docData.title || filePath.split('/').pop() || 'document',
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

  const handlePreview = async (filePath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('package-documents')
        .createSignedUrl(filePath, 3600);
      
      if (error) throw error;
      
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to preview document",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6 animate-fade-in">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!docData) {
    return (
      <div className="p-6 space-y-6 animate-fade-in">
        <Button 
          variant="ghost" 
          onClick={() => navigate(`/tenant/${tenantId}/documents`)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Documents
        </Button>
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Document not found
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Back Button */}
      <Button 
        variant="ghost" 
        onClick={() => navigate(`/tenant/${tenantId}/documents`)}
        className="gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black"
        style={{
          boxShadow: "var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)",
          border: "1px solid #00000052"
        }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{docData.title}</h1>
        <p className="text-sm text-muted-foreground">{tenantName}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Document Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {docData.description ? (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Description</label>
                  <p className="mt-1 text-foreground">{docData.description}</p>
                </div>
              ) : (
                <p className="text-muted-foreground">No description provided</p>
              )}
              
              <Separator />
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Category</label>
                  <div className="mt-1">
                    {docData.category ? (
                      <Badge variant="secondary">{docData.category}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Format</label>
                  <p className="mt-1">{docData.format || "—"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Created</label>
                  <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {docData.createdat ? new Date(docData.createdat).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    }) : '—'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Files */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Files</CardTitle>
            </CardHeader>
            <CardContent>
              {docData.uploaded_files && docData.uploaded_files.length > 0 ? (
                <div className="space-y-3">
                  {docData.uploaded_files.map((filePath, index) => {
                    const fileName = filePath.split('/').pop() || `File ${index + 1}`;
                    return (
                      <div 
                        key={index}
                        className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                          <span className="truncate text-sm">{fileName}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePreview(filePath)}
                            title="Preview"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownload(filePath)}
                            title="Download"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">No files attached</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
