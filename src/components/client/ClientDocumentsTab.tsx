import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { CreateDocumentDialog2 } from '@/components/CreateDocumentDialog2';
import { BulkUploadDialog } from '@/components/client/BulkUploadDialog';
import { 
  Search, 
  Plus, 
  Upload, 
  Download, 
  FileText, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  Tag,
  ArrowUpDown,
  Filter
} from 'lucide-react';
import { ClientPackage } from '@/hooks/useClientManagement';

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

interface ClientDocumentsTabProps {
  tenantId: number;
  packages: ClientPackage[];
}

type SortField = 'title' | 'category' | 'createdat';
type SortOrder = 'asc' | 'desc';

export function ClientDocumentsTab({ tenantId, packages }: ClientDocumentsTabProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('createdat');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedDocs, setSelectedDocs] = useState<Set<number>>(new Set());
  
  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [editDocument, setEditDocument] = useState<Document | null>(null);
  const [filesDialogOpen, setFilesDialogOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  const packageIds = packages.map(p => p.package_id);

  const fetchDocuments = useCallback(async () => {
    if (!tenantId || packageIds.length === 0) {
      setDocuments([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      const { data, error } = await (supabase as any)
        .from('documents')
        .select('*, packages:package_id(name)')
        .in('package_id', packageIds)
        .order('createdat', { ascending: false });

      if (error) throw error;

      const docsWithPackage = (data || []).map((doc: any) => ({
        ...doc,
        package_name: doc.packages?.name || null
      }));

      setDocuments(docsWithPackage);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to load documents',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId, packageIds.join(','), toast]);

  const fetchCategories = useCallback(async () => {
    const { data } = await supabase
      .from('documents_categories')
      .select('id, name')
      .order('name');
    
    if (data) setCategories(data);
  }, []);

  useEffect(() => {
    fetchDocuments();
    fetchCategories();
  }, [fetchDocuments, fetchCategories]);

  const handleDelete = async (docId: number) => {
    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', docId);

      if (error) throw error;

      toast({ title: 'Success', description: 'Document deleted' });
      fetchDocuments();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to delete document',
        variant: 'destructive'
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedDocs.size === 0) return;
    
    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .in('id', Array.from(selectedDocs));

      if (error) throw error;

      toast({ title: 'Success', description: `${selectedDocs.size} documents deleted` });
      setSelectedDocs(new Set());
      fetchDocuments();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to delete documents',
        variant: 'destructive'
      });
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

      toast({ title: 'Success', description: 'Document downloaded' });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to download document',
        variant: 'destructive'
      });
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const toggleSelectAll = () => {
    if (selectedDocs.size === filteredDocuments.length) {
      setSelectedDocs(new Set());
    } else {
      setSelectedDocs(new Set(filteredDocuments.map(d => d.id)));
    }
  };

  const toggleSelect = (docId: number) => {
    const newSelected = new Set(selectedDocs);
    if (newSelected.has(docId)) {
      newSelected.delete(docId);
    } else {
      newSelected.add(docId);
    }
    setSelectedDocs(newSelected);
  };

  // Filter and sort documents
  const filteredDocuments = documents
    .filter(doc => {
      const matchesSearch = 
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.category?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCategory = categoryFilter === 'all' || doc.category === categoryFilter;
      
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'category':
          comparison = (a.category || '').localeCompare(b.category || '');
          break;
        case 'createdat':
          comparison = new Date(a.createdat || 0).getTime() - new Date(b.createdat || 0).getTime();
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const uniqueCategories = [...new Set(documents.map(d => d.category).filter(Boolean))] as string[];

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Document
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setBulkUploadOpen(true)}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            Bulk Upload
          </Button>
          {selectedDocs.size > 0 && (
            <Button 
              variant="destructive" 
              onClick={handleBulkDelete}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete Selected ({selectedDocs.size})
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {uniqueCategories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Documents Table */}
      <div className="rounded-lg border bg-card shadow-sm overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedDocs.size === filteredDocuments.length && filteredDocuments.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="w-12">#</TableHead>
              <TableHead className="min-w-[200px]">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => toggleSort('title')}
                  className="gap-1 -ml-3"
                >
                  Document Name
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead className="min-w-[200px]">Description</TableHead>
              <TableHead className="w-32">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => toggleSort('category')}
                  className="gap-1 -ml-3"
                >
                  Category
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead className="w-32">Package</TableHead>
              <TableHead className="w-24 text-center">Released</TableHead>
              <TableHead className="w-32">Files</TableHead>
              <TableHead className="w-32">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => toggleSort('createdat')}
                  className="gap-1 -ml-3"
                >
                  Created
                  <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filteredDocuments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                  {documents.length === 0 
                    ? 'No documents yet. Click "Add Document" to get started.'
                    : 'No documents match your search criteria.'}
                </TableCell>
              </TableRow>
            ) : (
              filteredDocuments.map((doc, index) => (
                <TableRow 
                  key={doc.id}
                  className="group hover:bg-muted/50"
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedDocs.has(doc.id)}
                      onCheckedChange={() => toggleSelect(doc.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{index + 1}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="font-medium">{doc.title}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    <div className="truncate max-w-[200px]">{doc.description || '—'}</div>
                  </TableCell>
                  <TableCell>
                    {doc.category ? (
                      <Badge variant="secondary" className="gap-1">
                        <Tag className="h-3 w-3" />
                        {doc.category}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {doc.package_name ? (
                      <Badge variant="outline" className="text-xs">
                        {doc.package_name}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {doc.is_released ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto" />
                    ) : (
                      <XCircle className="h-5 w-5 text-muted-foreground mx-auto" />
                    )}
                  </TableCell>
                  <TableCell>
                    {doc.uploaded_files && doc.uploaded_files.length > 0 ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedFiles(doc.uploaded_files || []);
                          setFilesDialogOpen(true);
                        }}
                        className="text-xs"
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        {doc.uploaded_files.length} file{doc.uploaded_files.length > 1 ? 's' : ''}
                      </Button>
                    ) : (
                      <span className="text-muted-foreground text-sm">No files</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {doc.createdat ? new Date(doc.createdat).toLocaleDateString('en-AU', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    }) : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditDocument(doc)}
                        className="text-xs hover:bg-primary/10"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(doc.id)}
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

      {/* Add/Edit Document Dialog */}
      <CreateDocumentDialog2
        open={addDialogOpen || !!editDocument}
        onOpenChange={(open) => {
          if (!open) {
            setAddDialogOpen(false);
            setEditDocument(null);
          }
        }}
        onSuccess={() => {
          setAddDialogOpen(false);
          setEditDocument(null);
          fetchDocuments();
        }}
        packageId={packages[0]?.package_id}
        editDocument={editDocument || undefined}
        tenantId={tenantId}
      />

      {/* Bulk Upload Dialog */}
      <BulkUploadDialog
        open={bulkUploadOpen}
        onOpenChange={setBulkUploadOpen}
        onSuccess={() => {
          setBulkUploadOpen(false);
          fetchDocuments();
        }}
        tenantId={tenantId}
        packages={packages}
        categories={categories}
      />

      {/* Files List Dialog */}
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
                    onClick={() => handleDownload(filePath)}
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
