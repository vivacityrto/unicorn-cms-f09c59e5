import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useStageReviews, StageReleaseReview } from '@/hooks/useStageReviews';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  ClipboardCheck, RefreshCw, CheckCircle, XCircle, Clock, 
  Play, AlertCircle, ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';

export default function AdminReviews() {
  const navigate = useNavigate();
  const { reviews, loading, fetchReviews, updateReviewStatus } = useStageReviews();
  
  const [activeTab, setActiveTab] = useState('my');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedReview, setSelectedReview] = useState<StageReleaseReview | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
    };
    init();
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    
    if (activeTab === 'my') {
      fetchReviews({ reviewerUserId: currentUserId });
    } else if (activeTab === 'pending') {
      fetchReviews({ status: 'requested' });
    } else if (activeTab === 'in_review') {
      fetchReviews({ status: 'in_review' });
    } else {
      fetchReviews();
    }
  }, [activeTab, currentUserId, fetchReviews]);

  const handleStartReview = async (review: StageReleaseReview) => {
    setProcessing(true);
    const success = await updateReviewStatus(review.id, 'in_review');
    if (success) {
      fetchReviews(activeTab === 'my' ? { reviewerUserId: currentUserId! } : undefined);
    }
    setProcessing(false);
  };

  const handleOpenAction = (review: StageReleaseReview, type: 'approve' | 'reject') => {
    setSelectedReview(review);
    setActionType(type);
    setNotes('');
  };

  const handleCompleteAction = async () => {
    if (!selectedReview || !actionType) return;
    setProcessing(true);
    const success = await updateReviewStatus(
      selectedReview.id,
      actionType === 'approve' ? 'approved' : 'rejected',
      notes || undefined
    );
    if (success) {
      setSelectedReview(null);
      setActionType(null);
      fetchReviews(activeTab === 'my' ? { reviewerUserId: currentUserId! } : undefined);
    }
    setProcessing(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      case 'in_review':
        return <Badge className="bg-blue-100 text-blue-800"><Play className="h-3 w-3 mr-1" />In Review</Badge>;
      case 'requested':
        return <Badge className="bg-amber-100 text-amber-800"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const myPending = reviews.filter(r => 
    r.reviewer_user_id === currentUserId && 
    ['requested', 'in_review'].includes(r.status)
  );

  return (
    <AppLayout>
      <div className="container py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardCheck className="h-6 w-6" />
              Release Reviews
            </h1>
            <p className="text-muted-foreground">Review and approve stage releases before tenant delivery</p>
          </div>
          <Button variant="outline" onClick={() => fetchReviews()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Quick Stats */}
        {myPending.length > 0 && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                <span className="font-medium text-amber-800">
                  You have {myPending.length} review{myPending.length > 1 ? 's' : ''} awaiting your attention
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="my">My Reviews</TabsTrigger>
            <TabsTrigger value="pending">All Pending</TabsTrigger>
            <TabsTrigger value="in_review">In Progress</TabsTrigger>
            <TabsTrigger value="all">All Reviews</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  {activeTab === 'my' && 'My Assigned Reviews'}
                  {activeTab === 'pending' && 'Pending Reviews'}
                  {activeTab === 'in_review' && 'Reviews In Progress'}
                  {activeTab === 'all' && 'All Reviews'}
                </CardTitle>
                <CardDescription>
                  {activeTab === 'my' && 'Reviews assigned to you for action'}
                  {activeTab === 'pending' && 'Reviews waiting to be started'}
                  {activeTab === 'in_review' && 'Reviews currently being conducted'}
                  {activeTab === 'all' && 'Complete review history'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                    Loading reviews...
                  </div>
                ) : reviews.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No reviews found
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tenant</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead>Reviewer</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reviews.map(review => (
                        <TableRow key={review.id}>
                          <TableCell className="font-medium">
                            {review.stage_release?.tenant?.name || `Tenant ${review.stage_release?.tenant_id}`}
                          </TableCell>
                          <TableCell>
                            {review.stage_release?.stage?.title || `Stage ${review.stage_release?.stage_id}`}
                          </TableCell>
                          <TableCell>
                            {review.reviewer?.first_name} {review.reviewer?.last_name}
                          </TableCell>
                          <TableCell>{getStatusBadge(review.status)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(review.requested_at), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {review.status === 'requested' && review.reviewer_user_id === currentUserId && (
                                <Button 
                                  size="sm" 
                                  onClick={() => handleStartReview(review)}
                                  disabled={processing}
                                >
                                  <Play className="h-4 w-4 mr-1" />
                                  Start
                                </Button>
                              )}
                              {review.status === 'in_review' && review.reviewer_user_id === currentUserId && (
                                <>
                                  <Button 
                                    size="sm"
                                    onClick={() => handleOpenAction(review, 'approve')}
                                    disabled={processing}
                                  >
                                    <CheckCircle className="h-4 w-4 mr-1" />
                                    Approve
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="destructive"
                                    onClick={() => handleOpenAction(review, 'reject')}
                                    disabled={processing}
                                  >
                                    <XCircle className="h-4 w-4 mr-1" />
                                    Reject
                                  </Button>
                                </>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => navigate(`/tenant/${review.stage_release?.tenant_id}`)}
                              >
                                <ExternalLink className="h-4 w-4" />
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
          </TabsContent>
        </Tabs>
      </div>

      {/* Action Dialog */}
      <Dialog open={!!actionType} onOpenChange={() => { setActionType(null); setSelectedReview(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'Approve Release' : 'Reject Release'}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'approve'
                ? 'Confirm that this release has been reviewed and is ready for the tenant.'
                : 'Provide feedback on what needs to be corrected.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Notes {actionType === 'reject' && <span className="text-destructive">*</span>}
              </label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={actionType === 'approve' 
                  ? 'Optional review notes...'
                  : 'Explain what needs to be corrected...'}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionType(null); setSelectedReview(null); }}>
              Cancel
            </Button>
            <Button
              onClick={handleCompleteAction}
              disabled={processing || (actionType === 'reject' && !notes.trim())}
              variant={actionType === 'approve' ? 'default' : 'destructive'}
            >
              {processing ? 'Processing...' : actionType === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
