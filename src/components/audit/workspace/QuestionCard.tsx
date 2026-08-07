import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  AlertTriangle,
  Bot,
  HelpCircle,
  Flag,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { QuestionGuidance } from './QuestionGuidance';
import {
  RATING_OPTIONS_FULL,
  RATING_OPTIONS_SAFE,
  RATING_OPTIONS_CLOSING,
} from '@/types/auditWorkspace';
import type {
  TemplateQuestion,
  AuditResponse,
  QuestionContext,
  AuditFinding,
} from '@/types/auditWorkspace';
import { AddFindingForm } from './AddFindingForm';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useDebouncedAutosave } from './useDebouncedAutosave';
import { DictateButton } from '@/components/audit/DictateButton';
import { useAuditFindings } from '@/hooks/useAuditWorkspace';
import { EvidencePanel } from './EvidencePanel';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface QuestionCardProps {
  question: TemplateQuestion;
  response: AuditResponse | undefined;
  auditId: string;
  sectionId: string;
  questionContext?: QuestionContext;
  /** Template framework, used to resolve the Quality Area chip in QuestionGuidance. */
  framework?: string | null;
  /** Optional pre-loaded findings list. If omitted the card subscribes via useAuditFindings. */
  findings?: AuditFinding[];
  onRate: (questionId: string, rating: string, score: number, isFlagged: boolean) => void;
  onNote: (questionId: string, notes: string) => void;
  onAddFinding: (finding: any) => void;
}

const FLAGGED_RATINGS = new Set(['at_risk', 'non_compliant']);

export function QuestionCard({
  question,
  response,
  auditId,
  sectionId,
  questionContext,
  framework = null,
  findings: findingsProp,
  onRate,
  onNote,
  onAddFinding,
}: QuestionCardProps) {
  const ctx = questionContext || question.question_context || 'auditor_assessment';
  const [showFindingForm, setShowFindingForm] = useState(false);
  const [showLinkedFindings, setShowLinkedFindings] = useState(false);
  const [pulse, setPulse] = useState(false);
  const previousRatingRef = useRef<string | null | undefined>(response?.rating);
  const { value: notes, setValue: setNotes, bind: notesBind } = useDebouncedAutosave({
    serverValue: response?.notes || '',
    identityKey: response?.id || question.id,
    onSave: (v) => onNote(question.id, v),
    debounceMs: 500,
  });

  // Fetch findings for this audit if not supplied (cached by react-query, so no extra fetch).
  const { data: fetchedFindings } = useAuditFindings(findingsProp ? undefined : auditId);
  const findings = findingsProp ?? fetchedFindings;

  // Lookup the audit's subject_tenant_id once for the EvidencePanel linker.
  // Cached by react-query — every QuestionCard for this audit shares one fetch.
  const { data: auditMeta } = useQuery({
    queryKey: ['audit-tenant-meta', auditId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_audits' as any)
        .select('subject_tenant_id')
        .eq('id', auditId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown) as { subject_tenant_id: number | null } | null;
    },
    enabled: ctx === 'auditor_assessment',
    staleTime: 5 * 60 * 1000,
  });

  const queryClient = useQueryClient();

  const handleAcceptAi = (rating: string, notes: string) => {
    const score = getScore(rating);
    const ratingLabel =
      rating === 'at_risk' ? 'At Risk' : rating === 'non_compliant' ? 'Non-Compliant' : '';
    const isFlagged = question.flagged_responses?.includes(ratingLabel) ?? false;
    onRate(question.id, rating, score, isFlagged);
    if (notes && notes !== response?.notes) {
      setNotes(notes);
      onNote(question.id, notes);
    }
  };

  const handleDiscardAi = async () => {
    if (!response?.id) return;
    const { error } = await supabase
      .from('client_audit_responses' as any)
      .update({
        ai_suggested_rating: null,
        ai_suggested_notes: null,
        ai_confidence: null,
        ai_excerpts: null,
        ai_gaps: null,
      })
      .eq('id', response.id);
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['audit-responses', auditId] });
      queryClient.invalidateQueries({ queryKey: ['audit-workspace', auditId] });
      toast.success('Suggestion discarded.');
    } else {
      toast.error(error.message);
    }
  };

  const ratingOptions =
    ctx === 'closing_discussion'
      ? RATING_OPTIONS_CLOSING
      : question.response_set === 'safe_at_risk'
      ? RATING_OPTIONS_SAFE
      : RATING_OPTIONS_FULL;

  const currentRating = response?.rating;

  // Findings linked to this response
  const responseFindings = (findings || []).filter(
    (f) => response?.id && f.response_id === response.id
  );
  const findingCount = responseFindings.length;
  const ratingNeedsFinding =
    !!currentRating && FLAGGED_RATINGS.has(currentRating) && findingCount === 0;

  const getScore = (rating: string) => {
    switch (rating) {
      case 'compliant':
        return question.score_compliant;
      case 'at_risk':
        return question.score_at_risk;
      case 'non_compliant':
        return question.score_non_compliant;
      default:
        return 0;
    }
  };

  const handleRate = (rating: string) => {
    const previous = previousRatingRef.current;
    const score = getScore(rating);
    const isFlagged =
      question.flagged_responses?.includes(
        rating === 'at_risk'
          ? 'At Risk'
          : rating === 'non_compliant'
          ? 'Non-Compliant'
          : ''
      ) ?? false;
    onRate(question.id, rating, score, isFlagged);

    // If we transitioned INTO a flagged rating with no finding yet, pulse the button.
    if (FLAGGED_RATINGS.has(rating) && (!previous || !FLAGGED_RATINGS.has(previous)) && findingCount === 0) {
      setPulse(true);
      // Clear pulse after the keyframe completes (~2s).
      window.setTimeout(() => setPulse(false), 2100);
    }

    // If we transitioned OUT of a flagged rating with findings still attached, warn the user.
    if (
      previous &&
      FLAGGED_RATINGS.has(previous) &&
      !FLAGGED_RATINGS.has(rating) &&
      findingCount > 0
    ) {
      toast(
        `Rating changed to ${rating}. ${findingCount} linked finding${
          findingCount === 1 ? '' : 's'
        } remain.`,
        {
          action: {
            label: 'Review findings',
            onClick: () => setShowLinkedFindings(true),
          },
        }
      );
    }

    previousRatingRef.current = rating;
  };

  // Keep the ref in sync if the parent updates the response from elsewhere.
  useEffect(() => {
    previousRatingRef.current = response?.rating;
  }, [response?.rating]);

  

  const notesLabel =
    ctx === 'client_discussion'
      ? 'Client response / notes:'
      : ctx === 'closing_discussion'
      ? 'Client response:'
      : 'Auditor notes:';

  const ratingLabel = ctx === 'auditor_assessment' ? 'Assessment:' : 'Rating:';

  const notesPlaceholder =
    ctx === 'client_discussion'
      ? "Capture the client's response..."
      : ctx === 'closing_discussion'
      ? "Record the client's response to findings..."
      : 'Add notes...';

  const notesRows = ctx === 'client_discussion' ? 4 : ctx === 'closing_discussion' ? 4 : 2;

  // Warm tint for conversation phases
  const cardBg =
    ctx === 'client_discussion' || ctx === 'closing_discussion'
      ? 'bg-accent/10 border-accent/30'
      : '';

  const reviewFindingsButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="text-xs h-7"
      onClick={() => setShowLinkedFindings((v) => !v)}
      aria-expanded={showLinkedFindings}
    >
      <Flag className="h-3 w-3 mr-1.5" />
      Review {findingCount} finding{findingCount === 1 ? '' : 's'}
      <ChevronDown
        className={cn('h-3 w-3 ml-1.5 transition-transform', showLinkedFindings && 'rotate-180')}
      />
    </Button>
  );

  const reviewAndAddButtons = (
    <>
      {reviewFindingsButton}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-xs h-7"
        onClick={() => setShowFindingForm((v) => !v)}
      >
        <Plus className="h-3 w-3 mr-1.5" />
        Add another
      </Button>
    </>
  );

  // Action-row Raise Finding button — state machine
  const renderFindingButton = (fullWidth = false) => {
    if (!currentRating) return null;
    const flagged = FLAGGED_RATINGS.has(currentRating);

    if (!flagged && findingCount === 0) return null;

    if (!flagged && findingCount > 0) {
      return reviewAndAddButtons;
    }

    if (flagged && findingCount === 0) {
      return (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className={cn(
            'text-xs h-8 font-medium',
            fullWidth && 'w-full sm:w-auto',
            pulse && 'animate-pulse-once'
          )}
          onClick={() => setShowFindingForm((v) => !v)}
        >
          <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
          Raise finding
        </Button>
      );
    }

    // flagged && findingCount > 0
    return reviewAndAddButtons;
  };

  return (
    <Card className={cardBg}>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start gap-2">
          <div className="flex-1 space-y-1">
            {ctx !== 'auditor_assessment' && question.clause && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono font-medium">{question.clause}</span>
                {question.nc_map && (
                  <span className="text-muted-foreground/60">| {question.nc_map}</span>
                )}
                {ctx === 'client_discussion' && (
                  <span className="text-blue-600 text-[10px] font-medium">Context</span>
                )}
              </div>
            )}
            <p className="text-sm">{question.audit_statement}</p>
          </div>
          {ctx === 'auditor_assessment' && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50" />
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs text-xs">
                  Use this as your assessment criteria. Review the evidence and rate whether the RTO demonstrates this in practice.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Universal guidance block (chips, evidence, finding guide, Unicorn docs) */}
        {ctx === 'auditor_assessment' && (() => {
          const hasGuidance =
            !!question.clause ||
            !!question.evidence_to_sight ||
            !!question.corrective_action ||
            !!question.unicorn_documents;

          if (!hasGuidance) {
            return (
              <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                No standards mapping
              </span>
            );
          }

          return (
            <QuestionGuidance
              question={question}
              framework={framework}
              defaultOpen={{ findingGuide: ratingNeedsFinding }}
            />
          );
        })()}

        {/* For conversation phases: notes FIRST, then rating */}
        {(ctx === 'client_discussion' || ctx === 'closing_discussion') && (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-muted-foreground">{notesLabel}</label>
                <DictateButton
                  onTranscript={(t) => setNotes(notes ? `${notes} ${t}` : t)}
                />
              </div>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onFocus={notesBind.onFocus}
                onBlur={notesBind.onBlur}
                placeholder={notesPlaceholder}
                rows={notesRows}
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{ratingLabel}</label>
              <div className="flex flex-wrap gap-1.5">
                {ratingOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleRate(opt.value)}
                    className={cn(
                      'px-3 py-1 text-xs rounded-full border transition-all',
                      currentRating === opt.value
                        ? `${opt.color} font-medium ring-2 ring-offset-1 ring-primary/30`
                        : 'bg-background text-muted-foreground border-border hover:bg-muted'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* For auditor_assessment: rating first, then notes */}
        {ctx === 'auditor_assessment' && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{ratingLabel}</label>
              <div className="flex flex-wrap gap-1.5">
                {ratingOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleRate(opt.value)}
                    className={cn(
                      'px-3 py-1 text-xs rounded-full border transition-all',
                      currentRating === opt.value
                        ? `${opt.color} font-medium ring-2 ring-offset-1 ring-primary/30`
                        : 'bg-background text-muted-foreground border-border hover:bg-muted'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Finding guide now lives inside <QuestionGuidance /> above; auto-opens via defaultOpen.findingGuide. */}

            {/* Evidence linking + AI-suggested rating panel (Wave 4 #1) */}
            <EvidencePanel
              auditId={auditId}
              responseId={response?.id}
              subjectTenantId={auditMeta?.subject_tenant_id ?? null}
              currentRating={currentRating}
              aiSuggestion={{
                rating: (response as any)?.ai_suggested_rating ?? null,
                notes: (response as any)?.ai_suggested_notes ?? null,
                confidence: (response as any)?.ai_confidence ?? null,
                analyzedAt: (response as any)?.ai_analyzed_at ?? null,
                excerpts: (response as any)?.ai_excerpts ?? null,
                gaps: (response as any)?.ai_gaps ?? null,
              }}
              onAcceptRating={handleAcceptAi}
              onOverrideRating={handleAcceptAi}
              onDiscardSuggestion={handleDiscardAi}
            />


            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-muted-foreground">{notesLabel}</label>
                <DictateButton
                  onTranscript={(t) => setNotes(notes ? `${notes} ${t}` : t)}
                />
              </div>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onFocus={notesBind.onFocus}
                onBlur={notesBind.onBlur}
                placeholder={notesPlaceholder}
                rows={notesRows}
                className="text-xs"
              />
            </div>
          </>
        )}

        {/* In-card amber banner — only when a finding is required */}
        {ratingNeedsFinding && !showFindingForm && (
          <div className="flex flex-col gap-2 rounded-md border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-amber-900 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <span>This response requires a finding before the audit is complete.</span>
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className={cn('text-xs h-8 font-medium w-full sm:w-auto', pulse && 'animate-pulse-once')}
              onClick={() => setShowFindingForm(true)}
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
              Raise finding
            </Button>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {currentRating ? (
            renderFindingButton(true)
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs h-7 text-muted-foreground"
              onClick={() => setShowFindingForm((v) => !v)}
            >
              <Plus className="h-3 w-3 mr-1" />
              {ctx === 'auditor_assessment' ? 'Raise Finding' : 'Add Finding'}
            </Button>
          )}
        </div>

        {/* Existing findings linked to this question */}
        {showLinkedFindings && findingCount > 0 && (
          <div className="space-y-2 rounded-md border bg-muted/20 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Findings linked to this response
            </p>
            {responseFindings.map((finding) => (
              <div key={finding.id} className="space-y-1.5 rounded-md border bg-background p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  {finding.finding_code && (
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono font-bold">
                      {finding.finding_code}
                    </span>
                  )}
                  <span className="rounded-full border px-2 py-0.5 capitalize text-muted-foreground">
                    {finding.priority}
                  </span>
                  <span className="font-medium">{finding.summary}</span>
                </div>
                {finding.regulatory_reference && (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Regulatory reference:</span>{' '}
                    {finding.regulatory_reference}
                  </p>
                )}
                {finding.detail && <p className="whitespace-pre-wrap text-muted-foreground">{finding.detail}</p>}
                {finding.impact && (
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    <span className="font-medium text-foreground">Impact:</span> {finding.impact}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Inline finding form */}
        {showFindingForm && (
          <AddFindingForm
            auditId={auditId}
            sectionId={sectionId}
            responseId={response?.id}
            enableAiDraft={!!currentRating && FLAGGED_RATINGS.has(currentRating)}
            auditorNote={notes}
            initialValues={{
              regulatory_reference: `${question.clause} ${question.nc_map || ''}`.trim(),
            }}
            onSave={(finding) => {
              onAddFinding(finding);
              setShowFindingForm(false);
            }}
            onCancel={() => setShowFindingForm(false)}
          />
        )}
      </CardContent>
    </Card>
  );
}
