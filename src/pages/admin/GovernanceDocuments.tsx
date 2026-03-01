import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, FileCheck, ExternalLink, Upload, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { GovernanceDocumentDetail } from '@/components/governance/GovernanceDocumentDetail';

function GovernanceDocuments() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);

  // Fetch documents that are team-only (governance templates)
  const { data: documents, isLoading } = useQuery({
    queryKey: ['governance-documents', search, categoryFilter, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('documents')
        .select(`
          id, title, format, document_category, document_status,
          source_template_url, updated_at, current_published_version_id,
          document_versions(id, version_number, status, created_at, published_at, checksum_sha256)
        `)
        .or('is_team_only.is.null,is_team_only.eq.false')
        .order('title');

      if (search) {
        query = query.ilike('title', `%${search}%`);
      }
      if (categoryFilter && categoryFilter !== 'all') {
        query = query.eq('document_category', categoryFilter);
      }
      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('document_status', statusFilter);
      }

      const { data, error } = await query.limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch categories for filter
  const { data: categories } = useQuery({
    queryKey: ['governance-doc-categories'],
    queryFn: async () => {
      const { data } = await supabase
        .from('dd_document_categories')
        .select('label')
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
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories?.map((cat) => (
                <SelectItem key={cat.label} value={cat.label}>{cat.label}</SelectItem>
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
        </div>

        {/* Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Loading governance documents...
                </TableCell>
              </TableRow>
            ) : !documents?.length ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No governance documents found
                </TableCell>
              </TableRow>
            ) : (
              documents.map((doc: any) => {
                const currentVersion = getCurrentVersion(doc);
                return (
                  <TableRow
                    key={doc.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedDocId(doc.id)}
                  >
                    <TableCell className="font-medium">{doc.title}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{doc.document_category || '—'}</span>
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
                        >
                          <ExternalLink className="h-3 w-3" />
                          Source
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
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
      </div>
    </DashboardLayout>
  );
}

export default GovernanceDocuments;
