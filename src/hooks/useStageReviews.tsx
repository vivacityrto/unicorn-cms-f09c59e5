import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface StageReleaseReview {
  id: string;
  stage_release_id: string;
  requested_by: string | null;
  reviewer_user_id: string;
  status: 'requested' | 'in_review' | 'approved' | 'rejected' | 'cancelled';
  notes: string | null;
  checklist: Record<string, boolean> | null;
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
  reviewer?: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  };
  requester?: {
    first_name: string | null;
    last_name: string | null;
  };
  stage_release?: {
    id: string;
    status: string;
    tenant_id: number;
    stage_id: number;
    stage?: { title: string };
    tenant?: { name: string };
  };
}

export function useStageReviews() {
  const { toast } = useToast();
  const [reviews, setReviews] = useState<StageReleaseReview[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReviews = useCallback(async (filters?: {
    reviewerUserId?: string;
    stageReleaseId?: string;
    status?: string;
  }) => {
    setLoading(true);
    try {
      let query = (supabase as any)
        .from('stage_release_reviews')
        .select(`
          *,
          reviewer:users!stage_release_reviews_reviewer_user_id_fkey(first_name, last_name, email),
          stage_release:stage_releases(
            id, status, tenant_id, stage_id,
            stage:stages(name),
            tenant:tenants(name)
          )
        `)
        .order('requested_at', { ascending: false });

      if (filters?.reviewerUserId) {
        query = query.eq('reviewer_user_id', filters.reviewerUserId);
      }
      if (filters?.stageReleaseId) {
        query = query.eq('stage_release_id', filters.stageReleaseId);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      setReviews((data || []) as unknown as StageReleaseReview[]);
    } catch (error: any) {
      console.error('Failed to fetch reviews:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReviewForRelease = useCallback(async (stageReleaseId: string): Promise<StageReleaseReview | null> => {
    try {
      const { data, error } = await (supabase as any)
        .from('stage_release_reviews')
        .select(`
          *,
          reviewer:users!stage_release_reviews_reviewer_user_id_fkey(first_name, last_name, email)
        `)
        .eq('stage_release_id', stageReleaseId)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as StageReleaseReview | null;
    } catch (error: any) {
      console.error('Failed to fetch review:', error);
      return null;
    }
  }, []);

  const requestReview = async (stageReleaseId: string, reviewerUserId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('request_stage_review', {
        p_stage_release_id: stageReleaseId,
        p_reviewer_user_id: reviewerUserId
      });

      if (error) throw error;
      const result = data as unknown as { success: boolean; error?: string };
      if (!result?.success) throw new Error(result?.error || 'Failed to request review');

      toast({
        title: 'Review Requested',
        description: 'The reviewer has been notified'
      });
      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to request review',
        variant: 'destructive'
      });
      return false;
    }
  };

  const updateReviewStatus = async (
    reviewId: string,
    status: 'in_review' | 'approved' | 'rejected' | 'cancelled',
    notes?: string
  ): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('update_review_status', {
        p_review_id: reviewId,
        p_status: status,
        p_notes: notes || null
      });

      if (error) throw error;
      const result = data as unknown as { success: boolean; error?: string };
      if (!result?.success) throw new Error(result?.error || 'Failed to update review');

      const messages: Record<string, string> = {
        in_review: 'Review started',
        approved: 'Review approved',
        rejected: 'Review rejected',
        cancelled: 'Review cancelled'
      };

      toast({
        title: messages[status] || 'Review updated',
        description: status === 'approved' ? 'Release can now proceed' : undefined
      });
      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update review',
        variant: 'destructive'
      });
      return false;
    }
  };

  const getReviewEnforcement = async (): Promise<boolean> => {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('review_required_before_release')
        .single();
      return data?.review_required_before_release ?? false;
    } catch {
      return false;
    }
  };

  return {
    reviews,
    loading,
    fetchReviews,
    fetchReviewForRelease,
    requestReview,
    updateReviewStatus,
    getReviewEnforcement
  };
}
