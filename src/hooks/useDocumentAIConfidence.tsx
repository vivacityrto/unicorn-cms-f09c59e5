import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from './useAuth';

export type AIStatus = 'pending' | 'auto_approved' | 'needs_review' | 'rejected' | null;

export interface DocumentAIData {
  ai_confidence_score: number | null;
  ai_category_confidence: number | null;
  ai_description_confidence: number | null;
  ai_status: AIStatus;
  ai_last_run_at: string | null;
  ai_reasoning: string | null;
  ai_suggested_category: string | null;
  ai_suggested_description: string | null;
  user_edited_category: boolean;
  user_edited_description: boolean;
}

interface ApplyAIAnalysisResult {
  success: boolean;
  ai_status: AIStatus;
  overall_confidence: number;
  category_applied: boolean;
  description_applied: boolean;
}

interface RPCResult {
  success: boolean;
}

export function useDocumentAIConfidence() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);

  // Fetch AI data for a single document
  const fetchDocumentAIData = useCallback(async (documentId: number): Promise<DocumentAIData | null> => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select(`
          ai_confidence_score,
          ai_category_confidence,
          ai_description_confidence,
          ai_status,
          ai_last_run_at,
          ai_reasoning,
          ai_suggested_category,
          ai_suggested_description,
          user_edited_category,
          user_edited_description
        `)
        .eq('id', documentId)
        .single();

      if (error) throw error;
      return data as DocumentAIData;
    } catch (error) {
      console.error('Error fetching AI data:', error);
      return null;
    }
  }, []);

  // Apply AI analysis results (calls database function)
  const applyAIAnalysis = useCallback(async (
    documentId: number,
    categoryConfidence: number,
    descriptionConfidence: number,
    suggestedCategory: string,
    suggestedDescription: string,
    reasoning: string
  ) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('apply_document_ai_analysis', {
        p_document_id: documentId,
        p_category_confidence: categoryConfidence,
        p_description_confidence: descriptionConfidence,
        p_suggested_category: suggestedCategory,
        p_suggested_description: suggestedDescription,
        p_reasoning: reasoning,
        p_user_id: session?.user?.id || null
      });

      if (error) throw error;
      return data as unknown as ApplyAIAnalysisResult;
    } catch (error) {
      console.error('Error applying AI analysis:', error);
      toast.error('Failed to apply AI analysis');
      return null;
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  // Approve AI suggestions manually
  const approveAISuggestions = useCallback(async (
    documentId: number,
    applyCategory: boolean = true,
    applyDescription: boolean = true
  ) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('approve_document_ai_suggestions', {
        p_document_id: documentId,
        p_apply_category: applyCategory,
        p_apply_description: applyDescription,
        p_user_id: session?.user?.id || null
      });

      if (error) throw error;
      
      const result = data as unknown as RPCResult;
      if (result?.success) {
        toast.success('AI suggestions approved');
      }
      return result;
    } catch (error) {
      console.error('Error approving AI suggestions:', error);
      toast.error('Failed to approve AI suggestions');
      return null;
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  // Reject AI suggestions
  const rejectAISuggestions = useCallback(async (
    documentId: number,
    reason?: string
  ) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('reject_document_ai_suggestions', {
        p_document_id: documentId,
        p_reason: reason || null,
        p_user_id: session?.user?.id || null
      });

      if (error) throw error;
      
      const result = data as unknown as RPCResult;
      if (result?.success) {
        toast.success('AI suggestions rejected');
      }
      return result;
    } catch (error) {
      console.error('Error rejecting AI suggestions:', error);
      toast.error('Failed to reject AI suggestions');
      return null;
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  // Mark that user has edited a field (prevents AI overwrite)
  const markUserEdited = useCallback(async (
    documentId: number,
    field: 'category' | 'description'
  ) => {
    try {
      const updateData = field === 'category' 
        ? { user_edited_category: true }
        : { user_edited_description: true };
      
      const { error } = await supabase
        .from('documents')
        .update(updateData)
        .eq('id', documentId);

      if (error) throw error;
    } catch (error) {
      console.error('Error marking field as user-edited:', error);
    }
  }, []);

  // Fetch AI audit history for a document
  const fetchAIAuditHistory = useCallback(async (documentId: number) => {
    try {
      const { data, error } = await supabase
        .from('document_ai_audit')
        .select('*')
        .eq('document_id', documentId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching AI audit history:', error);
      return [];
    }
  }, []);

  return {
    loading,
    fetchDocumentAIData,
    applyAIAnalysis,
    approveAISuggestions,
    rejectAISuggestions,
    markUserEdited,
    fetchAIAuditHistory
  };
}

// Type for non-null AI statuses
type NonNullAIStatus = 'pending' | 'auto_approved' | 'needs_review' | 'rejected';

// Hook to get AI status counts for filtering
export function useDocumentAIStatusCounts(stageId?: number) {
  const [counts, setCounts] = useState<Record<NonNullAIStatus | 'none', number>>({
    pending: 0,
    auto_approved: 0,
    needs_review: 0,
    rejected: 0,
    none: 0
  });
  const [loading, setLoading] = useState(false);

  const fetchCounts = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('documents')
        .select('ai_status');

      if (stageId) {
        // Get document IDs linked to this stage
        const { data: stageDocIds } = await supabase
          .from('stage_documents')
          .select('document_id')
          .eq('stage_id', stageId);
        
        if (stageDocIds && stageDocIds.length > 0) {
          query = query.in('id', stageDocIds.map(d => d.document_id));
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      const newCounts: Record<NonNullAIStatus | 'none', number> = {
        pending: 0,
        auto_approved: 0,
        needs_review: 0,
        rejected: 0,
        none: 0
      };

      (data || []).forEach(doc => {
        const status = doc.ai_status;
        if (status && status in newCounts) {
          newCounts[status as NonNullAIStatus]++;
        } else {
          newCounts.none++;
        }
      });

      setCounts(newCounts);
    } catch (error) {
      console.error('Error fetching AI status counts:', error);
    } finally {
      setLoading(false);
    }
  }, [stageId]);

  return { counts, loading, fetchCounts };
}
