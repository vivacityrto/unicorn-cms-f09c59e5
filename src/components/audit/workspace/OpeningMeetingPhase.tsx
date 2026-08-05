import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { QuestionCard } from './QuestionCard';
import { useDebouncedAutosave } from './useDebouncedAutosave';
import type { AuditSection, AuditResponse, TemplateQuestion } from '@/types/auditWorkspace';

interface OpeningMeetingPhaseProps {
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

export function OpeningMeetingPhase({
  sections,
  responses,
  questionsBySection,
  userId,
  auditId,
  framework = null,
  onUpsertResponse,
  onAddFinding,
  onUpdateSummary,
}: OpeningMeetingPhaseProps) {
  return (
    <div className="space-y-4">
      <div className="bg-accent/10 border border-accent/30 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-foreground">Opening Meeting</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Conduct with the RTO representative present. Capture their context and responses.
        </p>
      </div>

      {sections.map(section => {
        const questions = questionsBySection[section.template_section_id || ''] || [];
        return (
          <div key={section.id} className="space-y-3">
            {questions.map(q => (
              <QuestionCard
                key={q.id}
                question={q}
                questionContext="client_discussion"
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

            <SummaryField
              sectionId={section.id}
              label="Overall opening meeting notes"
              placeholder="Capture general context, tone, who was present, any red flags from the conversation..."
              initialValue={section.section_summary || ''}
              onSave={(val) => onUpdateSummary(section.id, val)}
            />
          </div>
        );
      })}
    </div>
  );
}

function SummaryField({ sectionId, label, placeholder, initialValue, onSave }: {
  sectionId: string;
  label: string;
  placeholder: string;
  initialValue: string;
  onSave: (val: string) => void;
}) {
  const { value, setValue, bind } = useDebouncedAutosave({
    serverValue: initialValue,
    identityKey: sectionId,
    onSave,
    debounceMs: 800,
  });

  return (
    <Card className="bg-accent/10 border-accent/30">
      <CardContent className="p-4 space-y-2">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <Textarea
          value={value}
          onChange={e => setValue(e.target.value)}
          onFocus={bind.onFocus}
          onBlur={bind.onBlur}
          placeholder={placeholder}
          rows={4}
          className="bg-background"
        />
      </CardContent>
    </Card>
  );
}
