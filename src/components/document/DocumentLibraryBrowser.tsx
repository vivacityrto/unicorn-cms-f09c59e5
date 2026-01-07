import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Search, FileText, Layers, Filter, ExternalLink, 
  Sparkles, AlertTriangle 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

interface DocumentWithUsage {
  id: number;
  title: string;
  description: string | null;
  format: string | null;
  category: string | null;
  document_category: string | null;
  ai_category_suggestion: string | null;
  ai_confidence: number | null;
  stage_count: number;
  stage_names: string[];
  framework_type: string | null;
  document_status: string | null;
}

interface DocumentLibraryBrowserProps {
  onSelectDocument?: (doc: DocumentWithUsage) => void;
  selectable?: boolean;
  excludeDocumentIds?: number[];
  compact?: boolean;
}

const CATEGORIES = [
  'All Categories',
  'Policy',
  'Procedure',
  'Form',
  'Template',
  'Checklist',
  'Register',
  'Outcome Standards',
  'Compliance Requirements',
  'Training and Assessment',
  'Student Services'
];

export function DocumentLibraryBrowser({
  onSelectDocument,
  selectable = false,
  excludeDocumentIds = [],
  compact = false
}: DocumentLibraryBrowserProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<DocumentWithUsage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [frameworkFilter, setFrameworkFilter] = useState('all');

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch documents with stage usage
      const { data: docs, error: docsError } = await supabase
        .from('documents')
        .select(`
          id, title, description, format, category, document_category,
          ai_category_suggestion, ai_confidence, framework_type, document_status
        `)
        .order('title', { ascending: true })
        .limit(500);

      if (docsError) throw docsError;

      // Fetch stage usage counts
      const { data: usage, error: usageError } = await supabase
        .from('document_stage_usage')
        .select('document_id, stage_count, stage_names');

      if (usageError) throw usageError;

      // Merge data
      const usageMap = new Map(usage?.map(u => [u.document_id, u]) || []);
      
      const enrichedDocs: DocumentWithUsage[] = (docs || []).map(doc => ({
        ...doc,
        stage_count: usageMap.get(doc.id)?.stage_count || 0,
        stage_names: usageMap.get(doc.id)?.stage_names || []
      }));

      setDocuments(enrichedDocs);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Filter documents
  const filteredDocuments = documents.filter(doc => {
    // Exclude specified IDs
    if (excludeDocumentIds.includes(doc.id)) return false;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        doc.title.toLowerCase().includes(query) ||
        doc.description?.toLowerCase().includes(query) ||
        doc.category?.toLowerCase().includes(query) ||
        doc.document_category?.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    // Category filter
    if (categoryFilter !== 'All Categories') {
      const docCategory = doc.document_category || doc.category || doc.ai_category_suggestion;
      if (docCategory?.toLowerCase() !== categoryFilter.toLowerCase()) return false;
    }

    // Framework filter
    if (frameworkFilter !== 'all') {
      if (doc.framework_type !== frameworkFilter) return false;
    }

    return true;
  });

  const getFileTypeBadge = (format: string | null) => {
    const formatLower = (format || '').toLowerCase();
    if (formatLower.includes('doc') || formatLower.includes('word')) 
      return { label: 'Word', className: 'bg-blue-100 text-blue-700 border-blue-200' };
    if (formatLower.includes('xls') || formatLower.includes('excel')) 
      return { label: 'Excel', className: 'bg-green-100 text-green-700 border-green-200' };
    if (formatLower.includes('ppt') || formatLower.includes('powerpoint')) 
      return { label: 'PPT', className: 'bg-orange-100 text-orange-700 border-orange-200' };
    if (formatLower.includes('pdf')) 
      return { label: 'PDF', className: 'bg-red-100 text-red-700 border-red-200' };
    return { label: format || 'File', className: 'bg-muted text-muted-foreground' };
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(compact && "border-0 shadow-none")}>
      {!compact && (
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Document Library
          </CardTitle>
          <CardDescription>
            {documents.length} documents • {documents.filter(d => d.stage_count > 0).length} linked to stages
          </CardDescription>
        </CardHeader>
      )}
      <CardContent className={cn(compact && "p-0")}>
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={frameworkFilter} onValueChange={setFrameworkFilter}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="RTO">RTO</SelectItem>
              <SelectItem value="CRICOS">CRICOS</SelectItem>
              <SelectItem value="GTO">GTO</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Document List */}
        <ScrollArea className={cn("border rounded-lg", compact ? "h-[300px]" : "h-[500px]")}>
          {filteredDocuments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                {searchQuery || categoryFilter !== 'All Categories' 
                  ? 'No documents match your filters' 
                  : 'No documents in library'}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredDocuments.map((doc) => {
                const fileType = getFileTypeBadge(doc.format);
                const category = doc.document_category || doc.category || doc.ai_category_suggestion;
                const hasAISuggestion = doc.ai_category_suggestion && !doc.document_category;

                return (
                  <div
                    key={doc.id}
                    className={cn(
                      "flex items-center gap-3 p-3 transition-colors",
                      selectable && "cursor-pointer hover:bg-muted/50"
                    )}
                    onClick={() => selectable && onSelectDocument?.(doc)}
                  >
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{doc.title}</span>
                        {hasAISuggestion && (
                          <span title="AI suggested category">
                            <Sparkles className="h-3 w-3 text-primary shrink-0" />
                          </span>
                        )}
                      </div>
                      {doc.description && (
                        <p className="text-xs text-muted-foreground truncate">{doc.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="outline" className={cn("text-xs", fileType.className)}>
                          {fileType.label}
                        </Badge>
                        {category && (
                          <Badge variant="secondary" className="text-xs">
                            {category}
                          </Badge>
                        )}
                        {doc.framework_type && (
                          <Badge variant="outline" className="text-xs">
                            {doc.framework_type}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {doc.stage_count > 0 && (
                        <Badge 
                          variant="outline" 
                          className={cn(
                            "text-xs flex items-center gap-1",
                            doc.stage_count > 1 && "border-amber-200 bg-amber-50 text-amber-700"
                          )}
                        >
                          <Layers className="h-3 w-3" />
                          <span title={doc.stage_names?.join(', ')}>
                            {doc.stage_count} stage{doc.stage_count !== 1 ? 's' : ''}
                          </span>
                        </Badge>
                      )}
                      {!selectable && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/admin/documents/${doc.id}`);
                          }}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Summary */}
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <span>
            Showing {filteredDocuments.length} of {documents.length} documents
          </span>
          {filteredDocuments.some(d => d.stage_count > 1) && (
            <span className="flex items-center gap-1 text-amber-600">
              <AlertTriangle className="h-3 w-3" />
              Some documents are used in multiple stages
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
