import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ReviewSummary {
  topRiskDrivers: Array<{ clause: string; reason: string; severity: string }>;
  clauseClusterSummary: string;
  evidenceGapCount: number;
  stageHealthSummary: { critical: number; at_risk: number; healthy: number; monitoring: number };
}

export function useReviewMode(tenantId: number | null) {
  const [reviewMode, setReviewMode] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const startReview = useCallback(async () => {
    if (!tenantId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('tenant_review_sessions')
        .insert({
          tenant_id: tenantId,
          reviewer_user_id: user.id,
          review_mode: 'risk_first',
        })
        .select('id')
        .single();

      if (error) throw error;
      setSessionId(data.id);
      setReviewMode(true);
    } catch (err: any) {
      toast({
        title: 'Failed to start review',
        description: err.message,
        variant: 'destructive',
      });
    }
  }, [tenantId, toast]);

  const completeReview = useCallback(async () => {
    if (!sessionId) {
      setReviewMode(false);
      return;
    }
    try {
      await supabase
        .from('tenant_review_sessions')
        .update({ review_completed_at: new Date().toISOString() })
        .eq('id', sessionId);

      setReviewMode(false);
      setSessionId(null);
      toast({ title: 'Review completed', description: 'Session time has been recorded.' });
    } catch (err: any) {
      toast({
        title: 'Failed to complete review',
        description: err.message,
        variant: 'destructive',
      });
    }
  }, [sessionId, toast]);

  // Fetch review summary data
  const { data: reviewSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ['review-summary', tenantId],
    queryFn: async (): Promise<ReviewSummary> => {
      if (!tenantId) return { topRiskDrivers: [], clauseClusterSummary: '', evidenceGapCount: 0, stageHealthSummary: { critical: 0, at_risk: 0, healthy: 0, monitoring: 0 } };

      // Fetch risk events
      const { data: risks } = await supabase
        .from('risk_events')
        .select('standard_clause, notes, severity')
        .eq('tenant_id', tenantId)
        .in('severity', ['high', 'critical'])
        .order('created_at', { ascending: false })
        .limit(10);

      // Fetch evidence gaps
      const { data: gaps } = await supabase
        .from('evidence_gap_checks')
        .select('missing_categories_json')
        .eq('tenant_id', tenantId)
        .eq('status', 'flagged')
        .order('created_at', { ascending: false })
        .limit(1);

      // Fetch stage health
      const { data: stageHealth } = await supabase
        .from('stage_health_snapshots')
        .select('health_status')
        .eq('tenant_id', tenantId)
        .order('generated_at', { ascending: false })
        .limit(50);

      const topRiskDrivers = (risks || []).slice(0, 3).map(r => ({
        clause: r.standard_clause || 'Unknown',
        reason: r.notes || '',
        severity: r.severity || 'moderate',
      }));

      // Count clause occurrences
      const clauseCounts: Record<string, number> = {};
      (risks || []).forEach(r => {
        const c = r.standard_clause || 'Unknown';
        clauseCounts[c] = (clauseCounts[c] || 0) + 1;
      });
      const topClauses = Object.entries(clauseCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([clause, count]) => `${clause} (${count}x)`);

      const latestGap = gaps?.[0];
      const missingCategories = latestGap?.missing_categories_json as any[] | null;
      const evidenceGapCount = missingCategories?.length || 0;

      // Stage health summary
      const healthCounts = { critical: 0, at_risk: 0, healthy: 0, monitoring: 0 };
      (stageHealth || []).forEach(s => {
        const status = s.health_status as keyof typeof healthCounts;
        if (status in healthCounts) healthCounts[status]++;
      });

      return {
        topRiskDrivers,
        clauseClusterSummary: topClauses.length > 0 ? `Top clusters: ${topClauses.join(', ')}` : 'No clause clusters detected',
        evidenceGapCount,
        stageHealthSummary: healthCounts,
      };
    },
    enabled: !!tenantId && reviewMode,
  });

  return {
    reviewMode,
    sessionId,
    startReview,
    completeReview,
    reviewSummary,
    summaryLoading,
    toggleReviewMode: () => {
      if (reviewMode) {
        completeReview();
      } else {
        startReview();
      }
    },
  };
}
