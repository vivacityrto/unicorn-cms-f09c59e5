import { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown, ChevronUp, Plus, AlertTriangle, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RATING_OPTIONS_FULL, RATING_OPTIONS_SAFE } from '@/types/auditWorkspace';
import type { TemplateQuestion, AuditResponse } from '@/types/auditWorkspace';
import { AddFindingForm } from './AddFindingForm';

interface QuestionCardProps {
  question: TemplateQuestion;
  response: AuditResponse | undefined;
  auditId: string;
  sectionId: string;
  onRate: (questionId: string, rating: string, score: number, isFlagged: boolean) => void;
  onNote: (questionId: string, notes: string) => void;
  onAddFinding: (finding: any) => void;
}

export function QuestionCard({
  question,
  response,
  auditId,
  sectionId,
  onRate,
  onNote,
  onAddFinding,
}: QuestionCardProps) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [showFindingForm, setShowFindingForm] = useState(false);
  const [notes, setNotes] = useState(response?.notes || '');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const ratingOptions = question.response_set === 'safe_at_risk'
    ? RATING_OPTIONS_SAFE
    : RATING_OPTIONS_FULL;

  const currentRating = response?.rating;

  const getScore = (rating: string) => {
    switch (rating) {
      case 'compliant': return question.score_compliant;
      case 'at_risk': return question.score_at_risk;
      case 'non_compliant': return question.score_non_compliant;
      default: return 0;
    }
  };

  const handleRate = (rating: string) => {
    const score = getScore(rating);
    const isFlagged = question.flagged_responses?.includes(
      rating === 'at_risk' ? 'At Risk' : rating === 'non_compliant' ? 'Non-Compliant' : ''
    ) ?? false;
    onRate(question.id, rating, score, isFlagged);
  };

  const handleNotesChange = useCallback((value: string) => {
    setNotes(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onNote(question.id, value);
    }, 500);
  }, [question.id, onNote]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Check if flagged
  const isFlagged = response?.is_flagged && question.corrective_action;

  // Check AI suggestion
  const hasAiSuggestion = response?.ai_suggested_rating && !response?.rating;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <span className="font-mono font-medium">{question.clause}</span>
              {question.nc_map && (
                <span className="text-muted-foreground/60">| {question.nc_map}</span>
              )}
            </div>
            <p className="text-sm">{question.audit_statement}</p>
          </div>
        </div>

        {/* Evidence to sight */}
        {question.evidence_to_sight && (
          <div>
            <button
              onClick={() => setShowEvidence(!showEvidence)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              Evidence to sight
              {showEvidence ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showEvidence && (
              <p className="text-xs text-muted-foreground italic mt-1 pl-2 border-l-2 border-muted">
                {question.evidence_to_sight}
              </p>
            )}
          </div>
        )}

        {/* Rating pills */}
        <div className="flex flex-wrap gap-1.5">
          {ratingOptions.map(opt => (
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

        {/* Flagged response panel */}
        {isFlagged && (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs space-y-2">
            <div className="flex items-center gap-1.5 text-amber-700 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              Suggested corrective action:
            </div>
            <p className="text-amber-800">{question.corrective_action}</p>
          </div>
        )}

        {/* AI Suggestion */}
        {hasAiSuggestion && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs space-y-2">
            <div className="flex items-center gap-1.5 text-blue-700 font-medium">
              <Bot className="h-3.5 w-3.5" />
              AI pre-fill suggestion
              {response?.ai_confidence && (
                <span className="text-blue-500">(confidence: {Math.round(response.ai_confidence * 100)}%)</span>
              )}
            </div>
            <p className="text-blue-800">Rating: {response?.ai_suggested_rating}</p>
            {response?.ai_suggested_notes && (
              <p className="text-blue-800">{response.ai_suggested_notes}</p>
            )}
          </div>
        )}

        {/* Notes */}
        <Textarea
          value={notes}
          onChange={(e) => handleNotesChange(e.target.value)}
          placeholder="Add notes..."
          rows={2}
          className="text-xs"
        />

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={() => setShowFindingForm(!showFindingForm)}
          >
            <Plus className="h-3 w-3 mr-1" /> Add Finding
          </Button>
        </div>

        {/* Inline finding form */}
        {showFindingForm && (
          <AddFindingForm
            auditId={auditId}
            sectionId={sectionId}
            responseId={response?.id}
            defaultStandardRef={`${question.clause} ${question.nc_map || ''}`.trim()}
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
