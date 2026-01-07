import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { 
  Search, Filter, RefreshCw, Check, X, FileText, 
  ChevronDown, ChevronUp, Loader2, AlertCircle, 
  CheckCircle2, Clock, Sparkles, ExternalLink, Play
} from 'lucide-react';
import { AIConfidenceBadge, type AIStatus } from '@/components/document/AIConfidenceBadge';

interface DocumentForReview {
  id: number;
  title: string;
  format: string | null;
  document_category: string | null;
  description: string | null;
  ai_status: AIStatus;
  ai_confidence_score: number | null;
  ai_category_confidence: number | null;
  ai_description_confidence: number | null;
  ai_suggested_category: string | null;
  ai_suggested_description: string | null;
  ai_reasoning: string | null;
  ai_last_run_at: string | null;
  framework_type: string | null;
  source_signals: any;
  user_edited_category: boolean;
  user_edited_description: boolean;
  createdat: string | null;
}

interface ReviewStats {
  pending: number;
  needs_review: number;
  auto_approved: number;
  rejected: number;
}

export default function AdminDocumentAIReview() {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<DocumentForReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ReviewStats>({ pending: 0, needs_review: 0, auto_approved: 0, rejected: 0 });
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('needs_review');
  const [searchQuery, setSearchQuery] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState<string>('all');
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  
  // Detail dialog
  const [detailDoc, setDetailDoc] = useState<DocumentForReview | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processingAction, setProcessingAction] = useState(false);

  // Fetch documents
  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('documents')
        .select(`
          id, title, format, document_category, description,
          ai_status, ai_confidence_score, ai_category_confidence, ai_description_confidence,
          ai_suggested_category, ai_suggested_description, ai_reasoning, ai_last_run_at,
          framework_type, source_signals, user_edited_category, user_edited_description, createdat
        `)
        .order('ai_last_run_at', { ascending: false, nullsFirst: false });
      
      // Status filter
      if (statusFilter !== 'all') {
        query = query.eq('ai_status', statusFilter);
      }
      
      // Confidence filter
      if (confidenceFilter === 'high') {
        query = query.gte('ai_confidence_score', 80);
      } else if (confidenceFilter === 'medium') {
        query = query.gte('ai_confidence_score', 50).lt('ai_confidence_score', 80);
      } else if (confidenceFilter === 'low') {
        query = query.lt('ai_confidence_score', 50);
      }
      
      const { data, error } = await query.limit(200);
      
      if (error) throw error;
      setDocuments((data || []) as DocumentForReview[]);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      toast({ title: 'Failed to load documents', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, confidenceFilter, toast]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('ai_status');
      
      if (error) throw error;
      
      const newStats: ReviewStats = { pending: 0, needs_review: 0, auto_approved: 0, rejected: 0 };
      (data || []).forEach(doc => {
        if (doc.ai_status === 'pending') newStats.pending++;
        else if (doc.ai_status === 'needs_review') newStats.needs_review++;
        else if (doc.ai_status === 'auto_approved') newStats.auto_approved++;
        else if (doc.ai_status === 'rejected') newStats.rejected++;
      });
      setStats(newStats);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
    fetchStats();
  }, [fetchDocuments, fetchStats]);

  // Filter by search
  const filteredDocuments = documents.filter(doc => 
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (doc.ai_suggested_category || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Toggle selection
  const toggleSelection = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Select all visible
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredDocuments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredDocuments.map(d => d.id)));
    }
  };

  // Approve single document
  const approveDocument = async (docId: number) => {
    setProcessingAction(true);
    try {
      const { error } = await supabase.rpc('approve_document_ai_suggestions', {
        p_document_id: docId,
        p_apply_category: true,
        p_apply_description: true
      });
      
      if (error) throw error;
      
      toast({ title: 'Document approved' });
      fetchDocuments();
      fetchStats();
      setDetailDoc(null);
    } catch (error) {
      console.error('Approve error:', error);
      toast({ title: 'Failed to approve', variant: 'destructive' });
    } finally {
      setProcessingAction(false);
    }
  };

  // Reject single document
  const rejectDocument = async (docId: number, reason?: string) => {
    setProcessingAction(true);
    try {
      const { error } = await supabase.rpc('reject_document_ai_suggestions', {
        p_document_id: docId,
        p_reason: reason || null
      });
      
      if (error) throw error;
      
      toast({ title: 'Document rejected' });
      fetchDocuments();
      fetchStats();
      setDetailDoc(null);
      setRejectReason('');
    } catch (error) {
      console.error('Reject error:', error);
      toast({ title: 'Failed to reject', variant: 'destructive' });
    } finally {
      setProcessingAction(false);
    }
  };

  // Re-run AI analysis
  const rerunAnalysis = async (docId: number) => {
    setProcessingAction(true);
    try {
      const { error } = await supabase.functions.invoke('analyze-document', {
        body: { document_id: docId }
      });
      
      if (error) throw error;
      
      toast({ title: 'AI analysis restarted' });
      setTimeout(() => {
        fetchDocuments();
        fetchStats();
      }, 2000);
      setDetailDoc(null);
    } catch (error) {
      console.error('Rerun error:', error);
      toast({ title: 'Failed to start analysis', variant: 'destructive' });
    } finally {
      setProcessingAction(false);
    }
  };

  // Bulk approve selected
  const bulkApprove = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    
    setProcessingAction(true);
    let successCount = 0;
    
    for (const id of ids) {
      try {
        await supabase.rpc('approve_document_ai_suggestions', {
          p_document_id: id,
          p_apply_category: true,
          p_apply_description: true
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to approve ${id}:`, error);
      }
    }
    
    toast({ title: `Approved ${successCount} of ${ids.length} documents` });
    setSelectedIds(new Set());
    fetchDocuments();
    fetchStats();
    setProcessingAction(false);
  };

  // Get status badge
  const getStatusBadge = (status: AIStatus) => {
    switch (status) {
      case 'auto_approved':
        return <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Auto-approved</Badge>;
      case 'needs_review':
        return <Badge className="bg-amber-100 text-amber-700 border-amber-200"><AlertCircle className="h-3 w-3 mr-1" />Needs Review</Badge>;
      case 'rejected':
        return <Badge className="bg-red-100 text-red-700 border-red-200"><X className="h-3 w-3 mr-1" />Rejected</Badge>;
      case 'pending':
        return <Badge className="bg-gray-100 text-gray-700 border-gray-200"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="outline">No Status</Badge>;
    }
  };

  // Format confidence
  const formatConfidence = (value: number | null) => {
    if (value === null) return '-';
    return `${Math.round(value)}%`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              Document AI Review
            </h1>
            <p className="text-muted-foreground">Review and approve AI-generated metadata suggestions</p>
          </div>
          <Button variant="outline" onClick={() => { fetchDocuments(); fetchStats(); }} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="cursor-pointer hover:border-amber-300" onClick={() => setStatusFilter('needs_review')}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-amber-600">{stats.needs_review}</p>
                  <p className="text-sm text-muted-foreground">Needs Review</p>
                </div>
                <AlertCircle className="h-8 w-8 text-amber-200" />
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-gray-300" onClick={() => setStatusFilter('pending')}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-gray-600">{stats.pending}</p>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
                <Clock className="h-8 w-8 text-gray-200" />
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-green-300" onClick={() => setStatusFilter('auto_approved')}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-green-600">{stats.auto_approved}</p>
                  <p className="text-sm text-muted-foreground">Auto-approved</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-200" />
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-red-300" onClick={() => setStatusFilter('rejected')}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
                  <p className="text-sm text-muted-foreground">Rejected</p>
                </div>
                <X className="h-8 w-8 text-red-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="needs_review">Needs Review</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="auto_approved">Auto-approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Select value={confidenceFilter} onValueChange={setConfidenceFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Confidence" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Confidence</SelectItem>
                  <SelectItem value="high">High (80%+)</SelectItem>
                  <SelectItem value="medium">Medium (50-80%)</SelectItem>
                  <SelectItem value="low">Low (&lt;50%)</SelectItem>
                </SelectContent>
              </Select>
              {selectedIds.size > 0 && (
                <Button onClick={bulkApprove} disabled={processingAction}>
                  {processingAction ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                  Approve Selected ({selectedIds.size})
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Documents Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No documents match your filters</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={selectedIds.size === filteredDocuments.length && filteredDocuments.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Suggested Category</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Analyzed</TableHead>
                    <TableHead className="w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.map(doc => (
                    <TableRow 
                      key={doc.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setDetailDoc(doc)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(doc.id)}
                          onCheckedChange={() => toggleSelection(doc.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium truncate">{doc.title}</p>
                            {doc.framework_type && (
                              <Badge variant="outline" className="text-xs mt-1">
                                {doc.framework_type}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{doc.ai_suggested_category || '-'}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress 
                            value={doc.ai_confidence_score || 0} 
                            className="w-16 h-2"
                          />
                          <span className="text-sm text-muted-foreground">
                            {formatConfidence(doc.ai_confidence_score)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(doc.ai_status)}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {doc.ai_last_run_at 
                            ? new Date(doc.ai_last_run_at).toLocaleDateString()
                            : 'Never'
                          }
                        </span>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => approveDocument(doc.id)}
                            disabled={doc.ai_status === 'auto_approved'}
                            title="Approve"
                          >
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => { setDetailDoc(doc); }}
                            title="View Details"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Detail Dialog */}
        <Dialog open={!!detailDoc} onOpenChange={(open) => !open && setDetailDoc(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {detailDoc?.title}
              </DialogTitle>
              <DialogDescription>
                Review AI-generated metadata suggestions
              </DialogDescription>
            </DialogHeader>

            {detailDoc && (
              <ScrollArea className="flex-1 pr-4">
                <div className="space-y-6">
                  {/* Status */}
                  <div className="flex items-center justify-between">
                    {getStatusBadge(detailDoc.ai_status)}
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => window.open(`/admin/documents/${detailDoc.id}`, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Open Document
                    </Button>
                  </div>

                  {/* Confidence Scores */}
                  <div className="grid grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm text-muted-foreground mb-1">Overall</p>
                        <div className="flex items-center gap-2">
                          <Progress value={detailDoc.ai_confidence_score || 0} className="flex-1" />
                          <span className="font-medium">{formatConfidence(detailDoc.ai_confidence_score)}</span>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm text-muted-foreground mb-1">Category</p>
                        <div className="flex items-center gap-2">
                          <Progress value={detailDoc.ai_category_confidence || 0} className="flex-1" />
                          <span className="font-medium">{formatConfidence(detailDoc.ai_category_confidence)}</span>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4">
                        <p className="text-sm text-muted-foreground mb-1">Description</p>
                        <div className="flex items-center gap-2">
                          <Progress value={detailDoc.ai_description_confidence || 0} className="flex-1" />
                          <span className="font-medium">{formatConfidence(detailDoc.ai_description_confidence)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Suggested vs Current */}
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">Suggested Category</h4>
                      <div className="p-3 bg-muted rounded-lg">
                        <p>{detailDoc.ai_suggested_category || 'No suggestion'}</p>
                        {detailDoc.document_category && detailDoc.document_category !== detailDoc.ai_suggested_category && (
                          <p className="text-sm text-muted-foreground mt-1">
                            Current: {detailDoc.document_category}
                            {detailDoc.user_edited_category && <Badge variant="outline" className="ml-2 text-xs">User Edited</Badge>}
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">Suggested Description</h4>
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-sm">{detailDoc.ai_suggested_description || 'No suggestion'}</p>
                        {detailDoc.description && detailDoc.description !== detailDoc.ai_suggested_description && (
                          <div className="mt-2 pt-2 border-t">
                            <p className="text-sm text-muted-foreground">
                              Current: {detailDoc.description}
                              {detailDoc.user_edited_description && <Badge variant="outline" className="ml-2 text-xs">User Edited</Badge>}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Reasoning */}
                    <div>
                      <h4 className="font-medium mb-2">AI Reasoning</h4>
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-sm">{detailDoc.ai_reasoning || 'No reasoning available'}</p>
                      </div>
                    </div>

                    {/* Source Signals */}
                    {detailDoc.source_signals && (
                      <div>
                        <h4 className="font-medium mb-2">Detected Signals</h4>
                        <div className="p-3 bg-muted rounded-lg space-y-2 text-sm">
                          {detailDoc.source_signals.filename_tokens?.length > 0 && (
                            <p><strong>Filename:</strong> {detailDoc.source_signals.filename_tokens.slice(0, 8).join(', ')}</p>
                          )}
                          {detailDoc.source_signals.detected_standards?.length > 0 && (
                            <p><strong>Standards:</strong> {detailDoc.source_signals.detected_standards.join(', ')}</p>
                          )}
                          {detailDoc.source_signals.headings?.length > 0 && (
                            <p><strong>Headings:</strong> {detailDoc.source_signals.headings.slice(0, 3).join(', ')}</p>
                          )}
                          {(detailDoc.source_signals.header_text || detailDoc.source_signals.footer_text) && (
                            <p><strong>Header/Footer:</strong> Detected</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Reject reason input */}
                    {detailDoc.ai_status !== 'auto_approved' && (
                      <div>
                        <h4 className="font-medium mb-2">Rejection Reason (optional)</h4>
                        <Textarea
                          placeholder="Enter reason for rejection..."
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          rows={2}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            )}

            <DialogFooter className="gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => detailDoc && rerunAnalysis(detailDoc.id)}
                disabled={processingAction}
              >
                <Play className="h-4 w-4 mr-2" />
                Re-run AI
              </Button>
              <div className="flex-1" />
              <Button
                variant="destructive"
                onClick={() => detailDoc && rejectDocument(detailDoc.id, rejectReason)}
                disabled={processingAction || detailDoc?.ai_status === 'rejected'}
              >
                {processingAction ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <X className="h-4 w-4 mr-2" />}
                Reject
              </Button>
              <Button
                onClick={() => detailDoc && approveDocument(detailDoc.id)}
                disabled={processingAction || detailDoc?.ai_status === 'auto_approved'}
              >
                {processingAction ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                Approve
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
