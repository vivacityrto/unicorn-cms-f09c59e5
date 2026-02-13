/**
 * WeeklyReviewNotesPanel – Unicorn 2.0
 *
 * Tabbed panel for weekly review notes: Summary, Decisions, Next Actions.
 * Lightweight alignment records for Visionary + Integrator.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { FileText, Plus, Trash2, Lock, Copy, ChevronDown, CheckCircle2 } from 'lucide-react';
import {
  useWeeklyReview,
  genItemId,
  type WeeklyReviewRecord,
  type DecisionItem,
  type NextActionItem,
} from '@/hooks/useWeeklyReview';
import type { ExecutiveHealthRow } from '@/hooks/useExecutiveHealth';
import { format, parseISO } from 'date-fns';

interface WeeklyReviewNotesPanelProps {
  tenantUuid?: string;
  rawData: ExecutiveHealthRow[];
  kpis: {
    avgScore: number;
    avgScoreDelta: number;
    atRiskCount: number;
    criticalRisks: number;
    staleCount: number;
    totalPackages: number;
  };
  momentumLabel: string;
}

export function WeeklyReviewNotesPanel({
  tenantUuid,
  rawData,
  kpis,
  momentumLabel,
}: WeeklyReviewNotesPanelProps) {
  const {
    currentReview,
    isLoading,
    history,
    weekStart,
    isReadOnly,
    createDraft,
    isCreatingDraft,
    updateReview,
    isUpdating,
    finalise,
    isFinalising,
  } = useWeeklyReview(tenantUuid);

  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [headline, setHeadline] = useState('');
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [nextActions, setNextActions] = useState<NextActionItem[]>([]);

  // Viewed review (current or historical)
  const viewedReview = useMemo(() => {
    if (!selectedWeek || selectedWeek === weekStart) return currentReview;
    return history.find(h => h.week_start_date === selectedWeek) ?? null;
  }, [selectedWeek, weekStart, currentReview, history]);

  const viewingHistory = selectedWeek && selectedWeek !== weekStart;
  const effectiveReadOnly = isReadOnly || !!viewingHistory;

  // Sync local state from review
  useEffect(() => {
    const review = viewedReview;
    if (review) {
      setHeadline(review.headline ?? '');
      setDecisions((review.decisions as DecisionItem[]) ?? []);
      setNextActions((review.next_actions as NextActionItem[]) ?? []);
    }
  }, [viewedReview]);

  // Auto-create draft on mount if no current review exists
  useEffect(() => {
    if (!isLoading && !currentReview && tenantUuid && !isCreatingDraft) {
      const snapshot = {
        immediate: rawData.filter(r => r.risk_band === 'immediate_attention').length,
        atRisk: kpis.atRiskCount,
        stalled: kpis.staleCount,
        avgScore: kpis.avgScore,
        avgScoreDelta: kpis.avgScoreDelta,
        momentum: momentumLabel,
        total: kpis.totalPackages,
      };
      createDraft(snapshot);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, currentReview, tenantUuid]);

  // Save handler (debounced via blur)
  const saveField = useCallback(
    async (field: string, value: any) => {
      if (effectiveReadOnly || !currentReview) return;
      try {
        await updateReview({ [field]: value } as any);
      } catch {
        // toast handled by mutation
      }
    },
    [effectiveReadOnly, currentReview, updateReview]
  );

  // Decision helpers
  const addDecision = () => {
    if (effectiveReadOnly) return;
    const updated = [...decisions, { id: genItemId(), text: '' }];
    setDecisions(updated);
  };

  const updateDecision = (id: string, text: string) => {
    const updated = decisions.map(d => (d.id === id ? { ...d, text } : d));
    setDecisions(updated);
  };

  const removeDecision = (id: string) => {
    const updated = decisions.filter(d => d.id !== id);
    setDecisions(updated);
    saveField('decisions', updated);
  };

  const saveDecisions = () => saveField('decisions', decisions);

  // Next action helpers
  const addAction = () => {
    if (effectiveReadOnly) return;
    const updated = [
      ...nextActions,
      { id: genItemId(), action_text: '', owner_user_uuid: '', due_date: '', link: '' },
    ];
    setNextActions(updated);
  };

  const updateAction = (id: string, field: string, value: string) => {
    const updated = nextActions.map(a => (a.id === id ? { ...a, [field]: value } : a));
    setNextActions(updated);
  };

  const removeAction = (id: string) => {
    const updated = nextActions.filter(a => a.id !== id);
    setNextActions(updated);
    saveField('next_actions', updated);
  };

  const saveActions = () => saveField('next_actions', nextActions);

  // Copy summary to clipboard
  const copySummary = () => {
    const review = viewedReview;
    if (!review) return;
    const lines = [
      `Weekly Review — ${format(parseISO(review.week_start_date), 'dd MMM yyyy')}`,
      '',
      `Headline: ${review.headline ?? '(none)'}`,
      '',
      'Decisions:',
      ...(review.decisions as DecisionItem[]).map((d, i) => `  ${i + 1}. ${d.text}`),
      '',
      'Next Actions:',
      ...(review.next_actions as NextActionItem[]).map(
        (a, i) => `  ${i + 1}. ${a.action_text} — Due: ${a.due_date || 'TBD'}`
      ),
    ];
    navigator.clipboard.writeText(lines.join('\n'));
  };

  if (isLoading) return null;

  const portfolioSummary = viewedReview?.portfolio_summary as Record<string, any> | undefined;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Weekly Review Notes
            {effectiveReadOnly && (
              <Badge variant="outline" className="text-[10px] ml-1 gap-1">
                <Lock className="w-3 h-3" />
                {viewingHistory ? 'Historical' : 'Finalised'}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* History selector */}
            <Select
              value={selectedWeek || weekStart}
              onValueChange={v => setSelectedWeek(v)}
            >
              <SelectTrigger className="h-7 text-xs w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {history.length > 0 ? (
                  history.map(h => (
                    <SelectItem key={h.week_start_date} value={h.week_start_date}>
                      {format(parseISO(h.week_start_date), 'dd MMM yyyy')}
                      {h.status === 'final' ? ' ✓' : ' (draft)'}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value={weekStart}>
                    {format(parseISO(weekStart), 'dd MMM yyyy')} (current)
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={copySummary}>
              <Copy className="w-3 h-3" /> Copy
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="w-full rounded-none border-b border-border bg-transparent justify-start px-4 h-8">
            <TabsTrigger value="summary" className="text-xs h-7 data-[state=active]:shadow-none data-[state=active]:bg-muted">
              Summary
            </TabsTrigger>
            <TabsTrigger value="decisions" className="text-xs h-7 data-[state=active]:shadow-none data-[state=active]:bg-muted">
              Decisions ({decisions.length})
            </TabsTrigger>
            <TabsTrigger value="actions" className="text-xs h-7 data-[state=active]:shadow-none data-[state=active]:bg-muted">
              Next Actions ({nextActions.length})
            </TabsTrigger>
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="px-4 py-3 space-y-3 mt-0">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Headline</label>
              <Input
                value={headline}
                onChange={e => setHeadline(e.target.value)}
                onBlur={() => saveField('headline', headline)}
                placeholder="One sentence summary of this week…"
                disabled={effectiveReadOnly}
                className="h-8 text-xs mt-1"
              />
            </div>
            {portfolioSummary && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Portfolio Snapshot</label>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {portfolioSummary.immediate !== undefined && (
                    <div className="text-muted-foreground">
                      Immediate: <span className="font-medium text-foreground">{portfolioSummary.immediate}</span>
                    </div>
                  )}
                  {portfolioSummary.atRisk !== undefined && (
                    <div className="text-muted-foreground">
                      At Risk: <span className="font-medium text-foreground">{portfolioSummary.atRisk}</span>
                    </div>
                  )}
                  {portfolioSummary.stalled !== undefined && (
                    <div className="text-muted-foreground">
                      Stalled: <span className="font-medium text-foreground">{portfolioSummary.stalled}</span>
                    </div>
                  )}
                  {portfolioSummary.avgScore !== undefined && (
                    <div className="text-muted-foreground">
                      Avg Score: <span className="font-medium text-foreground">{portfolioSummary.avgScore}%</span>
                      {portfolioSummary.avgScoreDelta !== 0 && (
                        <span className={cn('ml-1', portfolioSummary.avgScoreDelta > 0 ? 'text-[hsl(275,55%,41%)]' : 'text-[hsl(333,86%,51%)]')}>
                          {portfolioSummary.avgScoreDelta > 0 ? '+' : ''}{portfolioSummary.avgScoreDelta}
                        </span>
                      )}
                    </div>
                  )}
                  {portfolioSummary.momentum && (
                    <div className="text-muted-foreground">
                      Momentum: <span className="font-medium text-foreground">{portfolioSummary.momentum}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* Discussion items from signals */}
            {viewedReview?.discussion_items && (viewedReview.discussion_items as any[]).length > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">
                  Discussion Items ({(viewedReview.discussion_items as any[]).length})
                </label>
                <ul className="space-y-1">
                  {(viewedReview.discussion_items as any[]).slice(0, 6).map((item: any, i: number) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="text-primary mt-0.5">•</span>
                      <span>
                        <span className="font-medium text-foreground">{item.client_name ?? 'Client'}</span>
                        {' — '}{item.title ?? item.text ?? ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>

          {/* Decisions Tab */}
          <TabsContent value="decisions" className="px-4 py-3 space-y-2 mt-0">
            {decisions.map(d => (
              <div key={d.id} className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-2 shrink-0" />
                <Input
                  value={d.text}
                  onChange={e => updateDecision(d.id, e.target.value)}
                  onBlur={saveDecisions}
                  placeholder="What was decided…"
                  disabled={effectiveReadOnly}
                  className="h-8 text-xs flex-1"
                />
                {!effectiveReadOnly && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeDecision(d.id)}>
                    <Trash2 className="w-3 h-3 text-muted-foreground" />
                  </Button>
                )}
              </div>
            ))}
            {!effectiveReadOnly && (
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addDecision}>
                <Plus className="w-3 h-3" /> Add Decision
              </Button>
            )}
          </TabsContent>

          {/* Next Actions Tab */}
          <TabsContent value="actions" className="px-4 py-3 space-y-2 mt-0">
            {nextActions.map(a => (
              <div key={a.id} className="flex items-start gap-2 flex-wrap">
                <Input
                  value={a.action_text}
                  onChange={e => updateAction(a.id, 'action_text', e.target.value)}
                  onBlur={saveActions}
                  placeholder="What needs to happen…"
                  disabled={effectiveReadOnly}
                  className="h-8 text-xs flex-1 min-w-[200px]"
                />
                <Input
                  type="date"
                  value={a.due_date}
                  onChange={e => updateAction(a.id, 'due_date', e.target.value)}
                  onBlur={saveActions}
                  disabled={effectiveReadOnly}
                  className="h-8 text-xs w-[130px]"
                />
                {!effectiveReadOnly && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeAction(a.id)}>
                    <Trash2 className="w-3 h-3 text-muted-foreground" />
                  </Button>
                )}
              </div>
            ))}
            {!effectiveReadOnly && (
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addAction}>
                <Plus className="w-3 h-3" /> Add Action
              </Button>
            )}
          </TabsContent>
        </Tabs>

        {/* Finalise bar */}
        {currentReview && !viewingHistory && (
          <div className="px-4 py-2 border-t border-border flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              {isReadOnly ? 'This review has been finalised.' : 'Finalise to lock this review.'}
            </p>
            {!isReadOnly && (
              <Button
                variant="default"
                size="sm"
                className="h-7 text-xs"
                onClick={() => finalise()}
                disabled={isFinalising}
              >
                {isFinalising ? 'Finalising…' : 'Finalise Weekly Review'}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
