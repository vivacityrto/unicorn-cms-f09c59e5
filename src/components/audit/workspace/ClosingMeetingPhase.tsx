import { useState, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { QuestionCard } from './QuestionCard';
import { useAuditFindings } from '@/hooks/useAuditWorkspace';
import type { AuditSection, AuditResponse, TemplateQuestion } from '@/types/auditWorkspace';

interface ClosingMeetingPhaseProps {
  sections: AuditSection[];
  responses: AuditResponse[];
  questionsBySection: Record<string, TemplateQuestion[]>;
  userId: string | undefined;
  auditId: string;
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
      <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4">
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
                  <Badge variant="outline" className="bg-red-200 text-red-900 text-[10px] flex-shrink-0">Critical ({critical.length})</Badge>
                  <span className="text-muted-foreground">{critical.map(f => f.summary).join('; ')}</span>
                </div>
              )}
              {high.length > 0 && (
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="bg-red-100 text-red-800 text-[10px] flex-shrink-0">High ({high.length})</Badge>
                  <span className="text-muted-foreground">{high.map(f => f.summary).join('; ')}</span>
                </div>
              )}
              {medium.length > 0 && (
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 text-[10px] flex-shrink-0">Medium ({medium.length})</Badge>
                  <span className="text-muted-foreground">{medium.map(f => f.summary).join('; ')}</span>
                </div>
              )}
              {low.length > 0 && (
                <div className="flex items-start gap-2">
                  <Badge variant="outline" className="bg-green-100 text-green-800 text-[10px] flex-shrink-0">Low ({low.length})</Badge>
                  <span className="text-muted-foreground">{low.map(f => f.summary).join('; ')}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {findings && findings.length === 0 && (
        <Card className="border-green-200 bg-green-50/30">
          <CardContent className="p-4 text-sm text-green-800">
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

            <Card className="bg-blue-50/30 border-blue-100">
              <CardContent className="p-4 space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Overall closing meeting notes
                </label>
                <ClosingSummaryField
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

function ClosingSummaryField({ initialValue, onSave }: { initialValue: string; onSave: (val: string) => void }) {
  const [value, setValue] = useState(initialValue);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleChange = useCallback((v: string) => {
    setValue(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSave(v), 800);
  }, [onSave]);

  return (
    <Textarea
      value={value}
      onChange={e => handleChange(e.target.value)}
      placeholder="Who was present, tone, any off-record comments, agreed next steps..."
      rows={5}
      className="bg-background"
    />
  );
}
