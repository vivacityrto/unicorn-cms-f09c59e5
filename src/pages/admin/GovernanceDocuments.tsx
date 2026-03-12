import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, FileCheck, ExternalLink, Upload, Eye, ArrowUpDown, Link2, Link2Off, FolderOpen } from 'lucide-react';
import { format } from 'date-fns';
import { GovernanceDocumentDetail } from '@/components/governance/GovernanceDocumentDetail';
import { useDocumentCategories } from '@/hooks/useDocumentCategories';
import { SharePointFileBrowser } from '@/components/documents/SharePointFileBrowser';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

type SortField = 'title' | 'category' | null;
type SortOrder = 'asc' | 'desc';

function GovernanceDocuments() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [frameworkFilter, setFrameworkFilter] = useState<string>('all');
  const [sharepointFilter, setSharepointFilter] = useState<string>('all');
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [sharepointBrowseDocId, setSharepointBrowseDocId] = useState<number | null>(null);

  const handleSharePointLinkSelected = async (url: string) => {
    if (!sharepointBrowseDocId) return;
    const { error } = await supabase
      .from('documents')
      .update({ source_template_url: url })
      .eq('id', sharepointBrowseDocId);
    if (error) {
      toast.error('Failed to update SharePoint URL');
    } else {
      toast.success('SharePoint URL saved');
      queryClient.invalidateQueries({ queryKey: ['governance-documents'] });
    }
    setSharepointBrowseDocId(null);
  };

  // Fetch documents that are team-only (governance templates)
  const { data: documents, isLoading } = useQuery({
    queryKey: ['governance-documents', search, categoryFilter, statusFilter, frameworkFilter, sharepointFilter],
    queryFn: async () => {
      let query = supabase
        .from('documents')
        .select(`
          id, title, format, category, document_status, framework_type,
          source_template_url, updated_at, current_published_version_id,
          document_versions!document_versions_document_id_fkey(id, version_number, status, created_at, published_at, checksum_sha256)
        `)
        .or('is_team_only.is.null,is_team_only.eq.false')
        .order('title');

      if (search) {
        query = query.ilike('title', `%${search}%`);
      }
      if (categoryFilter && categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter);
      }
      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('document_status', statusFilter);
      }
      if (frameworkFilter && frameworkFilter !== 'all') {
        if (frameworkFilter === '__none__') {
          query = query.is('framework_type', null);
        } else {
          query = query.eq('framework_type', frameworkFilter);
        }
      }

      if (sharepointFilter === 'has_url') {
        query = query.not('source_template_url', 'is', null);
      } else if (sharepointFilter === 'no_url') {
        query = query.is('source_template_url', null);
      }

      const { data, error } = await query.limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch total document count (unfiltered)
  const { data: totalCount } = useQuery({
    queryKey: ['governance-documents-total'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .or('is_team_only.is.null,is_team_only.eq.false');
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Fetch categories for filter
  const { categories, valueLabelMap } = useDocumentCategories();

  // Fetch frameworks for filter
  const { data: frameworks } = useQuery({
    queryKey: ['dd_governance_framework'],
    queryFn: async () => {
      const { data } = await supabase
        .from('dd_governance_framework')
        .select('value, label')
        .eq('is_active', true)
        .order('sort_order');
      return data || [];
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <Badge variant="default" className="bg-emerald-600">Published</Badge>;
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      case 'archived':
        return <Badge variant="outline">Archived</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getCurrentVersion = (doc: any) => {
    if (!doc.document_versions || doc.document_versions.length === 0) return null;
    const sorted = [...doc.document_versions].sort((a: any, b: any) => b.version_number - a.version_number);
    return sorted[0];
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const sortedDocuments = useMemo(() => {
    if (!documents || !sortField) return documents;
    return [...documents].sort((a: any, b: any) => {
      let valA: string, valB: string;
      if (sortField === 'category') {
        valA = valueLabelMap.get(a.category) || a.category || '';
        valB = valueLabelMap.get(b.category) || b.category || '';
      } else {
        valA = a.title || '';
        valB = b.title || '';
      }
      const cmp = valA.localeCompare(valB);
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [documents, sortField, sortOrder, valueLabelMap]);

  if (selectedDocId) {
    return (
      <DashboardLayout>
        <GovernanceDocumentDetail
          documentId={selectedDocId}
          onBack={() => setSelectedDocId(null)}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileCheck className="h-6 w-6" />
              Governance Documents
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage master document templates, versioning, and publishing
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={frameworkFilter} onValueChange={setFrameworkFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Framework" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Frameworks</SelectItem>
              <SelectItem value="__none__">No Framework</SelectItem>
              {frameworks?.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sharepointFilter} onValueChange={setSharepointFilter}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="SharePoint" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All SP Status</SelectItem>
              <SelectItem value="has_url">Has SP URL</SelectItem>
              <SelectItem value="no_url">No SP URL</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Framework</TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" onClick={() => toggleSort('title')} className="gap-1 -ml-3">
                  Title <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" onClick={() => toggleSort('category')} className="gap-1 -ml-3">
                  Category <ArrowUpDown className="h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-[120px] text-right">
                <span className="text-xs text-muted-foreground font-normal">
                  {documents?.length ?? 0} / {totalCount ?? 0}
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  Loading governance documents...
                </TableCell>
              </TableRow>
            ) : !documents?.length ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No governance documents found
                </TableCell>
              </TableRow>
            ) : (
              (sortedDocuments || []).map((doc: any) => {
                const currentVersion = getCurrentVersion(doc);
                return (
                  <TableRow
                    key={doc.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedDocId(doc.id)}
                  >
                    <TableCell>
                      <span className="text-xs font-medium">{doc.framework_type || '—'}</span>
                    </TableCell>
                    <TableCell className="font-medium">{doc.title}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{valueLabelMap.get(doc.category) || doc.category || '—'}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono">{doc.format || '—'}</span>
                    </TableCell>
                    <TableCell>
                      {currentVersion ? `v${currentVersion.version_number}` : '—'}
                    </TableCell>
                    <TableCell>{getStatusBadge(doc.document_status)}</TableCell>
                    <TableCell>
                      {doc.source_template_url ? (
                        <a
                          href={doc.source_template_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary hover:underline inline-flex items-center gap-1"
                          title={doc.source_template_url}
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          <span className="text-xs">SP</span>
                        </a>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setSharepointBrowseDocId(doc.id); }}
                          className="text-muted-foreground hover:text-primary cursor-pointer inline-flex items-center gap-1"
                          title="Click to set SharePoint URL"
                        >
                          <Link2Off className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {doc.updated_at ? format(new Date(doc.updated_at), 'dd MMM yyyy') : '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedDocId(doc.id); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* Master Documents SharePoint Browser Dialog */}
        <Dialog open={!!sharepointBrowseDocId} onOpenChange={(open) => { if (!open) setSharepointBrowseDocId(null); }}>
          <DialogContent className="max-w-[95vw] w-[1400px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5" />
                Master Documents — Select Template File
              </DialogTitle>
            </DialogHeader>
            {profile?.tenant_id && (
              <SharePointFileBrowser
                tenantId={profile.tenant_id}
                sitePurpose="master_documents"
                onSelectLink={(url, fileName) => {
                  handleSharePointLinkSelected(url);
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

export default GovernanceDocuments;
