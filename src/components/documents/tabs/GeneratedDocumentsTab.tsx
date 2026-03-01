import { useState, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Download, FileText, Calendar, Package, Tag, Sparkles, FileSpreadsheet, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useMissingMergeFields, MissingField } from '@/hooks/useMissingMergeFields';
import { MissingMergeFieldsDialog } from '@/components/tenant/MissingMergeFieldsDialog';
import { useExcelGeneration, isExcelDocument } from '@/hooks/useExcelGeneration';
import { useDocumentActivity } from '@/hooks/useDocumentActivity';

interface GeneratedDocument {
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
  is_auto_generated?: boolean | null;
  format?: string | null;
  is_client_visible?: boolean | null;
}

interface GeneratedDocumentsTabProps {
  tenantId: number;
  isClientView?: boolean;
  tenantName?: string;
}

export function GeneratedDocumentsTab({ tenantId, isClientView = false, tenantName }: GeneratedDocumentsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();
  
  // Missing merge fields state
  const [missingFieldsDialogOpen, setMissingFieldsDialogOpen] = useState(false);
  const [selectedDocForMerge, setSelectedDocForMerge] = useState<GeneratedDocument | null>(null);
  const [missingFieldsList, setMissingFieldsList] = useState<MissingField[]>([]);
  const [documentMissingFields, setDocumentMissingFields] = useState<Record<number, MissingField[]>>({});
  const [checkingFields, setCheckingFields] = useState(false);

  const { detectMissingFields } = useMissingMergeFields(tenantId);
  const { generateAndDownload, isDocumentGenerating } = useExcelGeneration();
  const { logDownload } = useDocumentActivity();

  // Fetch generated documents (from documents table with is_auto_generated = true)
  const { data: documents = [], isLoading, refetch } = useQuery({
    queryKey: ['generated-documents', tenantId],
    queryFn: async () => {
      // Get tenant's package IDs
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('package_id, package_ids')
        .eq('id', tenantId)
        .single();

      if (!tenantData) return [];

      const packageIds = (tenantData as any).package_ids || (tenantData.package_id ? [tenantData.package_id] : []);
      if (packageIds.length === 0) return [];

      let query = (supabase as any)
        .from('documents')
        .select('*, packages:package_id(name)')
        .in('package_id', packageIds)
        .eq('is_auto_generated', true);

      // For client view, only show released + client visible
      if (isClientView) {
        query = query.eq('is_released', true);
      }

      const { data, error } = await query.order('createdat', { ascending: false });
      if (error) throw error;

      return (data || []).map((doc: any) => ({
        ...doc,
        package_name: doc.packages?.name || null,
      }));
    },
    enabled: !!tenantId,
  });

  // Check missing fields for all documents
  const checkAllMissingFields = useCallback(async (docs: GeneratedDocument[]) => {
    if (!tenantId || docs.length === 0) return;
    
    setCheckingFields(true);
    const missingByDoc: Record<number, MissingField[]> = {};
    
    for (const doc of docs) {
      if (doc.is_auto_generated) {
        // Query required tags from document_fields
        const { data: fieldRows } = await supabase
          .from('document_fields')
          .select('field:dd_fields(tag)')
          .eq('document_id', doc.id);
        
        const docFieldCodes = (fieldRows || [])
          .map((r: any) => r.field?.tag)
          .filter(Boolean);
        
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
  }, [tenantId, detectMissingFields]);

  useEffect(() => {
    if (documents.length > 0) {
      checkAllMissingFields(documents);
    }
  }, [documents, checkAllMissingFields]);

  const filteredDocs = documents.filter(doc => 
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenMissingFields = (doc: GeneratedDocument) => {
    const missing = documentMissingFields[doc.id] || [];
    setSelectedDocForMerge(doc);
    setMissingFieldsList(missing);
    setMissingFieldsDialogOpen(true);
  };

  const handleMissingFieldsSuccess = () => {
    refetch();
  };

  const handleExcelGenerate = async (doc: GeneratedDocument) => {
    const hasMissingFields = documentMissingFields[doc.id]?.length > 0;
    if (hasMissingFields) {
      handleOpenMissingFields(doc);
      return;
    }

    // Get client_legacy_id from tenants table
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('client_legacy_id')
      .eq('id', tenantId)
      .single();

    await generateAndDownload({
      documentId: doc.id,
      tenantId,
      clientLegacyId: (tenantData as any)?.client_legacy_id,
      stageId: doc.stage || undefined,
      packageId: doc.package_id || undefined,
    });
  };

  const handleDownload = async (filePath: string, doc: GeneratedDocument) => {
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
      logDownload({
        tenantId,
        clientId: tenantId,
        packageId: doc.package_id || undefined,
        stageId: doc.stage || undefined,
        documentId: doc.id,
        fileName: doc.title || filePath.split('/').pop() || 'document',
        actorRole: isClientView ? 'tenant' : 'internal',
      });
      
      toast({ title: 'Download started' });
    } catch (error: any) {
      toast({
        title: 'Download failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (doc: GeneratedDocument) => {
    const hasMissingFields = documentMissingFields[doc.id]?.length > 0;
    
    if (checkingFields) {
      return (
        <Badge variant="secondary" className="text-xs gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Checking...
        </Badge>
      );
    }
    
    if (hasMissingFields) {
      return (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500 text-xs gap-1">
          <AlertCircle className="h-3 w-3" />
          Pending Info
        </Badge>
      );
    }
    
    return (
      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500 text-xs gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Ready
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full max-w-md" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search generated documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Documents Table */}
      {filteredDocs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">No generated documents</p>
            <p className="text-sm mt-1">
              Auto-generated documents from templates will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Document</TableHead>
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead className="hidden lg:table-cell">Package</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocs.map((doc) => (
                <TableRow key={doc.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Sparkles className="h-5 w-5 text-primary flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{doc.title}</p>
                        {doc.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {doc.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {doc.category ? (
                      <Badge variant="secondary" className="gap-1">
                        <Tag className="h-3 w-3" />
                        {doc.category}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {doc.package_name ? (
                      <Badge variant="outline" className="gap-1">
                        <Package className="h-3 w-3" />
                        {doc.package_name}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{getStatusBadge(doc)}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {doc.createdat && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(doc.createdat), 'MMM d, yyyy')}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {isExcelDocument(doc.format) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExcelGenerate(doc)}
                          disabled={isDocumentGenerating(doc.id)}
                          className="gap-2 bg-green-500/10 text-green-600 border-green-500 hover:bg-green-500/20"
                        >
                          {isDocumentGenerating(doc.id) ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <FileSpreadsheet className="h-3 w-3" />
                              Generate
                            </>
                          )}
                        </Button>
                      ) : doc.uploaded_files?.[0] ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDownload(doc.uploaded_files![0], doc)}
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Missing Merge Fields Dialog */}
      {selectedDocForMerge && (
        <MissingMergeFieldsDialog
          open={missingFieldsDialogOpen}
          onOpenChange={setMissingFieldsDialogOpen}
          tenantId={tenantId}
          missingFields={missingFieldsList}
          documentName={selectedDocForMerge.title}
          documentId={selectedDocForMerge.id}
          stageId={selectedDocForMerge.stage || undefined}
          packageId={selectedDocForMerge.package_id || undefined}
          onSuccess={handleMissingFieldsSuccess}
        />
      )}
    </div>
  );
}
