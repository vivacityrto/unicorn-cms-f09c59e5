import { useState, useEffect } from 'react';
import { useStageReviews, StageReleaseReview } from '@/hooks/useStageReviews';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  ClipboardCheck, UserCheck, Clock, CheckCircle, XCircle, 
  AlertCircle, Play, Send, X, RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';

interface ReleaseReviewPanelProps {
  stageReleaseId: string;
  releaseStatus: string;
  onReviewChange?: () => void;
}

interface User {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  unicorn_role: string;
}

export function ReleaseReviewPanel({ stageReleaseId, releaseStatus, onReviewChange }: ReleaseReviewPanelProps) {
  const { fetchReviewForRelease, requestReview, updateReviewStatus, getReviewEnforcement } = useStageReviews();
  
  const [review, setReview] = useState<StageReleaseReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedReviewer, setSelectedReviewer] = useState<string>('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [showActionDialog, setShowActionDialog] = useState<'approve' | 'reject' | null>(null);
  const [processing, setProcessing] = useState(false);
  const [reviewRequired, setReviewRequired] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [stageReleaseId]);

  const loadData = async () => {
    setLoading(true);
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);

    // Fetch review
    const reviewData = await fetchReviewForRelease(stageReleaseId);
    setReview(reviewData);

    // Fetch admin users for reviewer selection
    const { data: usersData } = await (supabase
      .from('users')
      .select('user_uuid, first_name, last_name, email, unicorn_role') as any)
      .in('unicorn_role', ['Super Admin', 'Admin'])
      .eq('is_active', true);
    setUsers(usersData || []);

    // Get enforcement setting
    const required = await getReviewEnforcement();
    setReviewRequired(required);

    setLoading(false);
  };

  const handleRequestReview = async () => {
    if (!selectedReviewer) return;
    setProcessing(true);
    const success = await requestReview(stageReleaseId, selectedReviewer);
    if (success) {
      setShowRequestDialog(false);
      setSelectedReviewer('');
      await loadData();
      onReviewChange?.();
    }
    setProcessing(false);
  };

  const handleStartReview = async () => {
    if (!review) return;
    setProcessing(true);
    const success = await updateReviewStatus(review.id, 'in_review');
    if (success) {
      await loadData();
      onReviewChange?.();
    }
    setProcessing(false);
  };

  const handleCompleteReview = async (approved: boolean) => {
    if (!review) return;
    setProcessing(true);
    const success = await updateReviewStatus(
      review.id, 
      approved ? 'approved' : 'rejected',
      reviewNotes || undefined
    );
    if (success) {
      setShowActionDialog(null);
      setReviewNotes('');
      await loadData();
      onReviewChange?.();
    }
    setProcessing(false);
  };

  const handleCancelReview = async () => {
    if (!review) return;
    setProcessing(true);
    const success = await updateReviewStatus(review.id, 'cancelled');
    if (success) {
      await loadData();
      onReviewChange?.();
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
        return <Badge className="bg-amber-100 text-amber-800"><Clock className="h-3 w-3 mr-1" />Requested</Badge>;
      case 'cancelled':
        return <Badge variant="secondary"><X className="h-3 w-3 mr-1" />Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const isReviewer = review?.reviewer_user_id === currentUserId;
  const canStartReview = isReviewer && review?.status === 'requested';
  const canCompleteReview = isReviewer && review?.status === 'in_review';
  const hasActiveReview = review && ['requested', 'in_review'].includes(review.status);
  const isApproved = review?.status === 'approved';

  if (loading) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-center text-muted-foreground">
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            Loading review status...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Internal Review
            {reviewRequired && !isApproved && releaseStatus !== 'released' && (
              <Badge variant="outline" className="ml-auto text-xs">Required</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!review || review.status === 'cancelled' ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {reviewRequired 
                  ? 'A review must be approved before this release can be completed.'
                  : 'Request an internal review before releasing to tenant.'}
              </p>
              <Button onClick={() => setShowRequestDialog(true)} size="sm">
                <Send className="h-4 w-4 mr-2" />
                Request Review
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                {getStatusBadge(review.status)}
              </div>

              {/* Reviewer */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Reviewer</span>
                <span className="text-sm font-medium flex items-center gap-1">
                  <UserCheck className="h-3 w-3" />
                  {review.reviewer?.first_name} {review.reviewer?.last_name}
                </span>
              </div>

              {/* Timestamps */}
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Requested: {format(new Date(review.requested_at), 'MMM d, yyyy HH:mm')}</div>
                {review.started_at && (
                  <div>Started: {format(new Date(review.started_at), 'MMM d, yyyy HH:mm')}</div>
                )}
                {review.completed_at && (
                  <div>Completed: {format(new Date(review.completed_at), 'MMM d, yyyy HH:mm')}</div>
                )}
              </div>

              {/* Notes */}
              {review.notes && (
                <div className="p-2 bg-muted rounded text-sm">
                  <span className="font-medium">Notes: </span>
                  {review.notes}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2">
                {canStartReview && (
                  <Button size="sm" onClick={handleStartReview} disabled={processing}>
                    <Play className="h-4 w-4 mr-1" />
                    Start Review
                  </Button>
                )}
                {canCompleteReview && (
                  <>
                    <Button size="sm" onClick={() => setShowActionDialog('approve')} disabled={processing}>
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setShowActionDialog('reject')} disabled={processing}>
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </>
                )}
                {hasActiveReview && (
                  <Button size="sm" variant="ghost" onClick={handleCancelReview} disabled={processing}>
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                )}
              </div>

              {/* Enforcement warning */}
              {reviewRequired && !isApproved && releaseStatus !== 'released' && (
                <div className="flex items-start gap-2 p-2 bg-amber-50 text-amber-800 rounded text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Review must be approved before release can proceed.</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Request Review Dialog */}
      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Internal Review</DialogTitle>
            <DialogDescription>
              Select a team member to review this release before it's sent to the tenant.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Reviewer</label>
              <Select value={selectedReviewer} onValueChange={setSelectedReviewer}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reviewer" />
                </SelectTrigger>
                <SelectContent>
                  {users.map(user => (
                    <SelectItem key={user.user_uuid} value={user.user_uuid}>
                      {user.first_name} {user.last_name} ({user.unicorn_role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequestDialog(false)}>Cancel</Button>
            <Button onClick={handleRequestReview} disabled={!selectedReviewer || processing}>
              {processing ? 'Requesting...' : 'Request Review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve/Reject Dialog */}
      <Dialog open={!!showActionDialog} onOpenChange={() => setShowActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {showActionDialog === 'approve' ? 'Approve Release' : 'Reject Release'}
            </DialogTitle>
            <DialogDescription>
              {showActionDialog === 'approve' 
                ? 'Confirm that this release has been reviewed and is ready for the tenant.'
                : 'Provide feedback on what needs to be corrected before this can be released.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes {showActionDialog === 'reject' && '(required)'}</label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder={showActionDialog === 'approve' 
                  ? 'Optional review notes...'
                  : 'Explain what needs to be corrected...'}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActionDialog(null)}>Cancel</Button>
            <Button 
              onClick={() => handleCompleteReview(showActionDialog === 'approve')}
              disabled={processing || (showActionDialog === 'reject' && !reviewNotes.trim())}
              variant={showActionDialog === 'approve' ? 'default' : 'destructive'}
            >
              {processing ? 'Processing...' : showActionDialog === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
