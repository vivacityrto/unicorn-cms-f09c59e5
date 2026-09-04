/**
 * useWeeklyReview – Unicorn 2.0
 *
 * Manages the exec_weekly_reviews lifecycle:
 * auto-create draft, load, save, finalise, history.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCallback, useMemo } from 'react';
import { toast } from '@/hooks/use-toast';
import type { Json, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

// Monday of the current week in Australia/Sydney
function getCurrentWeekStart(): string {
  const now = new Date();
  // Approximate Sydney offset (+10/+11) — use UTC day of week
  const utcDay = now.getUTCDay();
  const diff = utcDay === 0 ? 6 : utcDay - 1; // Monday = 0
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() - diff);
  return monday.toISOString().slice(0, 10);
}

export interface DecisionItem {
  id: string;
  text: string;
  client_link?: string;
  owner?: string;
}

export interface NextActionItem {
  id: string;
  action_text: string;
  owner_user_uuid: string;
  owner_name?: string;
  due_date: string;
  link?: string;
  context?: string;
}

export interface WeeklyReviewRecord {
  id: string;
  tenant_uuid: string;
  week_start_date: string;
  visionary_user_uuid: string | null;
  integrator_user_uuid: string | null;
  status: string;
  headline: string | null;
  portfolio_summary: Record<string, unknown>;
  discussion_items: unknown[];
  decisions: DecisionItem[];
  next_actions: NextActionItem[];
  risks: unknown[];
  created_by_user_uuid: string;
  created_at: string;
  updated_by_user_uuid: string;
  updated_at: string;
}

// Generate unique ids for items
let _counter = 0;
export function genItemId() {
  _counter++;
  return `item_${Date.now()}_${_counter}`;
}

export function useWeeklyReview(tenantUuid?: string) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const weekStart = getCurrentWeekStart();
  const userId = profile?.user_uuid;

  // Fetch current week review
  const { data: currentReview, isLoading } = useQuery({
    queryKey: ['weekly-review', tenantUuid, weekStart],
    queryFn: async (): Promise<WeeklyReviewRecord | null> => {
      if (!tenantUuid) return null;
      const { data, error } = await supabase
        .from('exec_weekly_reviews')
        .select('*')
        .eq('tenant_uuid', tenantUuid)
        .eq('week_start_date', weekStart)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as WeeklyReviewRecord | null;
    },
    enabled: !!tenantUuid && !!userId,
    staleTime: 10_000,
  });

  // Fetch history (last 12 weeks)
  const { data: history } = useQuery({
    queryKey: ['weekly-review-history', tenantUuid],
    queryFn: async (): Promise<WeeklyReviewRecord[]> => {
      if (!tenantUuid) return [];
      const { data, error } = await supabase
        .from('exec_weekly_reviews')
        .select('*')
        .eq('tenant_uuid', tenantUuid)
        .order('week_start_date', { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as unknown as WeeklyReviewRecord[];
    },
    enabled: !!tenantUuid && !!userId,
    staleTime: 30_000,
  });

  // Auto-create draft
  const createDraftMutation = useMutation({
    mutationFn: async (portfolioSnapshot: Record<string, unknown>) => {
      if (!tenantUuid || !userId) throw new Error('Missing context');
      const insertPayload: TablesInsert<'exec_weekly_reviews'> = {
        tenant_uuid: tenantUuid,
        week_start_date: weekStart,
        status: 'draft',
        portfolio_summary: portfolioSnapshot as Json,
        created_by_user_uuid: userId,
        updated_by_user_uuid: userId,
      };
      const { data, error } = await supabase
        .from('exec_weekly_reviews')
        .insert(insertPayload)
        .select()
        .single();
      if (error) {
        // Unique constraint — record already exists
        if (error.code === '23505') return null;
        throw error;
      }
      // Audit log
      if (data) {
        const auditInsert: TablesInsert<'exec_weekly_review_audit_log'> = {
          review_id: data.id,
          action: 'create',
          user_id: userId,
          details: { auto_created: true },
        };
        await supabase.from('exec_weekly_review_audit_log').insert(auditInsert);
      }
      return data as unknown as WeeklyReviewRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-review', tenantUuid, weekStart] });
      queryClient.invalidateQueries({ queryKey: ['weekly-review-history', tenantUuid] });
    },
  });

  // Update review
  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<WeeklyReviewRecord>) => {
      if (!currentReview || !userId) throw new Error('No review to update');
      const updatePayload = {
        ...updates,
        updated_by_user_uuid: userId,
      } as unknown as TablesUpdate<'exec_weekly_reviews'>;
      const { error } = await supabase
        .from('exec_weekly_reviews')
        .update(updatePayload)
        .eq('id', currentReview.id);
      if (error) throw error;
      // Audit
      const auditInsert: TablesInsert<'exec_weekly_review_audit_log'> = {
        review_id: currentReview.id,
        action: 'update',
        user_id: userId,
        details: { fields: Object.keys(updates) },
      };
      await supabase.from('exec_weekly_review_audit_log').insert(auditInsert);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-review', tenantUuid, weekStart] });
      queryClient.invalidateQueries({ queryKey: ['weekly-review-history', tenantUuid] });
    },
  });

  // Finalise
  const finaliseMutation = useMutation({
    mutationFn: async () => {
      if (!currentReview || !userId) throw new Error('No review');
      if (!currentReview.headline?.trim()) throw new Error('Headline required');
      const hasDecision = (currentReview.decisions as DecisionItem[])?.length > 0;
      const hasAction = (currentReview.next_actions as NextActionItem[])?.length > 0;
      if (!hasDecision && !hasAction) throw new Error('At least one decision or action required');

      const { error } = await supabase
        .from('exec_weekly_reviews')
        .update({ status: 'final', updated_by_user_uuid: userId })
        .eq('id', currentReview.id);
      if (error) throw error;
      const auditInsert: TablesInsert<'exec_weekly_review_audit_log'> = {
        review_id: currentReview.id,
        action: 'finalise',
        user_id: userId,
      };
      await supabase.from('exec_weekly_review_audit_log').insert(auditInsert);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-review', tenantUuid, weekStart] });
      queryClient.invalidateQueries({ queryKey: ['weekly-review-history', tenantUuid] });
      toast({ title: 'Weekly review finalised', description: 'Record is now locked.' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Cannot finalise', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    },
  });

  const isReadOnly = currentReview?.status === 'final';

  return {
    currentReview,
    isLoading,
    history: history ?? [],
    weekStart,
    isReadOnly,
    createDraft: createDraftMutation.mutateAsync,
    isCreatingDraft: createDraftMutation.isPending,
    updateReview: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    finalise: finaliseMutation.mutateAsync,
    isFinalising: finaliseMutation.isPending,
  };
}
