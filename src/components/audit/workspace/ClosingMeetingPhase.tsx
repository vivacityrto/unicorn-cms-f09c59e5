import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { QuestionCard } from './QuestionCard';
import { useDebouncedAutosave } from './useDebouncedAutosave';
import { useAuditFindings } from '@/hooks/useAuditWorkspace';
import type { AuditSection, AuditResponse, TemplateQuestion } from '@/types/auditWorkspace';

interface ClosingMeetingPhaseProps {
  sections: AuditSection[];
  responses: AuditResponse[];
  questionsBySection: Record<string, TemplateQuestion[]>;
  userId: string | undefined;
  auditId: string;
  framework?: string | null;
  onUpsertResponse: (data: any) => void;
  onAddFinding: (f: any) => void;
  onUpdateSummary: (sectionId: string, summary: string) => void;
}

export function ClosingMeetingPhase({
  sections,
  responses,
  questionsBySection,
  userId,
  auditId,
  framework = null,
  onUpsertResponse,
  onAddFinding,
  onUpdateSummary,
}: ClosingMeetingPhaseProps) {
  const { data: findings } = useAuditFindings(auditId);

  const critical = findings?.filter(f => f.priority === 'critical') || [];
  const high = findings?.filter(f => f.priority === 'high') || [];
  const medium = findings?.filter(f => f.priority === 'medium') || [];
  const low = findings?.filter(f => f.priority === 'low') || [];

  return (
    <div className="space-y-4">
      <div className="bg-accent/10 border border-accent/30 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-foreground">Closing Meeting</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Reconvene with the RTO representative. Present findings, capture their response.
        </p>
      </div>

      {/* Findings summary panel */}
      {findings && findings.length > 0 && (
        <Card className="border-muted">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold">Summary of findings to present:</p>
            <div className="space-y-1.5 text-xs">
              {critical.length > 0 && (
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="bg-red-200 text-red-900 dark:bg-red-950/50 dark:text-red-300 text-[10px] flex-shrink-0">Critical ({critical.length})</Badge>
                  <span className="text-muted-foreground">{critical.map(f => f.summary).join('; ')}</span>
                </div>
              )}
              {high.length > 0 && (
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300 text-[10px] flex-shrink-0">High ({high.length})</Badge>
                  <span className="text-muted-foreground">{high.map(f => f.summary).join('; ')}</span>
                </div>
              )}
              {medium.length > 0 && (
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 text-[10px] flex-shrink-0">Medium ({medium.length})</Badge>
                  <span className="text-muted-foreground">{medium.map(f => f.summary).join('; ')}</span>
                </div>
              )}
              {low.length > 0 && (
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300 text-[10px] flex-shrink-0">Low ({low.length})</Badge>
                  <span className="text-muted-foreground">{low.map(f => f.summary).join('; ')}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {findings && findings.length === 0 && (
        <Card className="border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/40">
          <CardContent className="p-4 text-sm text-green-800 dark:text-green-300">
            No findings to present. All standard areas assessed as compliant.
          </CardContent>
        </Card>
      )}

      {sections.map(section => {
        const questions = questionsBySection[section.template_section_id || ''] || [];
        return (
          <div key={section.id} className="space-y-3">
            {questions.map(q => (
              <QuestionCard
                key={q.id}
                question={q}
                questionContext="closing_discussion"
                response={responses.find(r => r.question_id === q.id)}
                auditId={auditId}
                sectionId={section.id}
                framework={framework}
                onRate={(questionId, rating, score, isFlagged) => {
                  if (!userId) return;
                  onUpsertResponse({
                    audit_id: auditId,
                    section_id: section.id,
                    question_id: questionId,
                    rating, score, is_flagged: isFlagged,
                    responded_by: userId,
                  });
                }}
                onNote={(questionId, notesValue) => {
                  if (!userId) return;
                  const existing = responses.find(r => r.question_id === questionId);
                  onUpsertResponse({
                    audit_id: auditId,
                    section_id: section.id,
                    question_id: questionId,
                    rating: existing?.rating || null,
                    notes: notesValue,
                    score: existing?.score || null,
                    is_flagged: existing?.is_flagged || false,
                    responded_by: userId,
                  });
                }}
                onAddFinding={onAddFinding}
              />
            ))}

            <Card className="bg-accent/10 border-accent/30">
              <CardContent className="p-4 space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Overall closing meeting notes
                </label>
                <ClosingSummaryField
                  sectionId={section.id}
                  initialValue={section.section_summary || ''}
                  onSave={(val) => onUpdateSummary(section.id, val)}
                />
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}

function ClosingSummaryField({ sectionId, initialValue, onSave }: { sectionId: string; initialValue: string; onSave: (val: string) => void }) {
  const { value, setValue, bind } = useDebouncedAutosave({
    serverValue: initialValue,
    identityKey: sectionId,
    onSave,
    debounceMs: 800,
  });

  return (
    <Textarea
      value={value}
      onChange={e => setValue(e.target.value)}
      onFocus={bind.onFocus}
      onBlur={bind.onBlur}
      placeholder="Who was present, tone, any off-record comments, agreed next steps..."
      rows={5}
      className="bg-background"
    />
  );
}
