import { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QuestionCard } from './QuestionCard';
import type { AuditSection, AuditResponse, TemplateQuestion } from '@/types/auditWorkspace';

interface DocumentReviewPhaseProps {
  sections: AuditSection[];
  responses: AuditResponse[];
  questionsBySection: Record<string, TemplateQuestion[]>;
  userId: string | undefined;
  auditId: string;
  onUpsertResponse: (data: any) => void;
  onAddFinding: (f: any) => void;
  onUpdateSummary: (sectionId: string, summary: string) => void;
  onUpdateRiskLevel: (sectionId: string, riskLevel: string) => void;
  selectedSectionId?: string;
}

interface OutcomeGroup {
  label: string;
  sections: AuditSection[];
}

function groupSectionsByOutcome(sections: AuditSection[]): OutcomeGroup[] {
  const groups: Record<string, AuditSection[]> = {};
  const order: string[] = [];

  for (const s of sections) {
    const title = s.title || '';
    let groupLabel = 'Compliance requirements';

    const outcomeMatch = title.match(/^Outcome\s+(\d+)/i);
    if (outcomeMatch) {
      const num = outcomeMatch[1];
      const labels: Record<string, string> = {
        '1': 'Outcome 1 — Training and assessment',
        '2': 'Outcome 2 — VET student support',
        '3': 'Outcome 3 — VET workforce',
        '4': 'Outcome 4 — Governance',
      };
      groupLabel = labels[num] || `Outcome ${num}`;
    } else if (/^Standard/i.test(title)) {
      const stdMatch = title.match(/^Standard\s+(\d+)/i);
      if (stdMatch) {
        const num = parseInt(stdMatch[1]);
        if (num <= 5) groupLabel = 'Outcome 1 — Training and assessment';
        else if (num <= 10) groupLabel = 'Outcome 2 — VET student support';
        else if (num <= 12) groupLabel = 'Outcome 3 — VET workforce';
        else if (num <= 15) groupLabel = 'Outcome 4 — Governance';
      }
    }

    if (!groups[groupLabel]) {
      groups[groupLabel] = [];
      order.push(groupLabel);
    }
    groups[groupLabel].push(s);
  }

  return order.map(label => ({ label, sections: groups[label] }));
}

export function DocumentReviewPhase({
  sections,
  responses,
  questionsBySection,
  userId,
  auditId,
  onUpsertResponse,
  onAddFinding,
  onUpdateSummary,
  onUpdateRiskLevel,
  selectedSectionId,
}: DocumentReviewPhaseProps) {
  const outcomeGroups = groupSectionsByOutcome(sections);

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm flex items-start gap-2">
        <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-blue-800">
          Document review phase — client is not present. Review documents and evidence independently. Rate each standard area based on what you sight, not what was claimed.
        </p>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-foreground">Document Review</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Work independently. Review each standard area against the evidence you sight. The client is not present for this phase.
        </p>
      </div>

      {outcomeGroups.map(group => {
        const groupQuestionCount = group.sections.reduce((sum, s) => {
          return sum + (questionsBySection[s.template_section_id || '']?.length || 0);
        }, 0);
        const groupAnswered = group.sections.reduce((sum, s) => {
          const qs = questionsBySection[s.template_section_id || ''] || [];
          return sum + qs.filter(q => responses.find(r => r.question_id === q.id && r.rating)).length;
        }, 0);
        const groupPct = groupQuestionCount > 0 ? Math.round((groupAnswered / groupQuestionCount) * 100) : 0;
        const groupRiskLevels = group.sections.map(s => s.risk_level).filter(Boolean);
        const highestRisk = groupRiskLevels.includes('critical') ? 'critical'
          : groupRiskLevels.includes('high') ? 'high'
          : groupRiskLevels.includes('medium') ? 'medium'
          : groupRiskLevels.includes('low') ? 'low'
          : null;

        return (
          <div key={group.label} className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b">
              <h4 className="text-sm font-semibold text-foreground">{group.label}</h4>
              <div className="flex items-center gap-2">
                {highestRisk && <RiskBadge risk={highestRisk} />}
                <span className="text-xs text-muted-foreground">{groupPct}% complete</span>
              </div>
            </div>

            {group.sections.map(section => (
              <DocumentReviewSection
                key={section.id}
                section={section}
                questions={questionsBySection[section.template_section_id || ''] || []}
                responses={responses}
                userId={userId}
                auditId={auditId}
                onUpsertResponse={onUpsertResponse}
                onAddFinding={onAddFinding}
                onUpdateSummary={onUpdateSummary}
                onUpdateRiskLevel={onUpdateRiskLevel}
                isSelected={section.id === selectedSectionId}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function RiskBadge({ risk }: { risk: string }) {
  const colors: Record<string, string> = {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-amber-100 text-amber-800',
    high: 'bg-red-100 text-red-800',
    critical: 'bg-red-200 text-red-900',
  };
  return <Badge variant="outline" className={cn('text-[10px]', colors[risk])}>{risk}</Badge>;
}

function DocumentReviewSection({
  section,
  questions,
  responses,
  userId,
  auditId,
  onUpsertResponse,
  onAddFinding,
  onUpdateSummary,
  onUpdateRiskLevel,
  isSelected,
}: {
  section: AuditSection;
  questions: TemplateQuestion[];
  responses: AuditResponse[];
  userId: string | undefined;
  auditId: string;
  onUpsertResponse: (data: any) => void;
  onAddFinding: (f: any) => void;
  onUpdateSummary: (sectionId: string, summary: string) => void;
  onUpdateRiskLevel: (sectionId: string, riskLevel: string) => void;
  isSelected: boolean;
}) {
  const [open, setOpen] = useState(isSelected || true);
  const answered = questions.filter(q => responses.find(r => r.question_id === q.id && r.rating)).length;

  return (
    <Card id={`section-${section.id}`}>
      <CardHeader className="cursor-pointer py-3" onClick={() => setOpen(!open)}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">{section.title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {answered} of {questions.length} assessed
            </p>
          </div>
          <div className="flex items-center gap-2">
            {section.risk_level && <RiskBadge risk={section.risk_level} />}
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3 pt-0">
          {questions.map(q => (
            <QuestionCard
              key={q.id}
              question={q}
              questionContext="auditor_assessment"
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

          {/* Section risk level selector */}
          <div className="pt-3 border-t space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Section risk level:</label>
            <div className="flex gap-1.5">
              {['low', 'medium', 'high', 'critical'].map(level => (
                <button
                  key={level}
                  onClick={() => onUpdateRiskLevel(section.id, level)}
                  className={cn(
                    'px-3 py-1 text-xs rounded-full border transition-all capitalize',
                    section.risk_level === level
                      ? level === 'low' ? 'bg-green-100 text-green-800 border-green-300 font-medium ring-2 ring-offset-1 ring-green-300/30'
                        : level === 'medium' ? 'bg-amber-100 text-amber-800 border-amber-300 font-medium ring-2 ring-offset-1 ring-amber-300/30'
                        : level === 'high' ? 'bg-red-100 text-red-800 border-red-300 font-medium ring-2 ring-offset-1 ring-red-300/30'
                        : 'bg-red-200 text-red-900 border-red-400 font-medium ring-2 ring-offset-1 ring-red-400/30'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  )}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Section summary */}
          <SectionSummaryField
            initialValue={section.section_summary || ''}
            onSave={(val) => onUpdateSummary(section.id, val)}
          />
        </CardContent>
      )}
    </Card>
  );
}

function SectionSummaryField({ initialValue, onSave }: { initialValue: string; onSave: (val: string) => void }) {
  const [value, setValue] = useState(initialValue);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const handleChange = useCallback((v: string) => {
    setValue(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSave(v), 800);
  }, [onSave]);

  return (
    <div className="pt-2 space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">Section assessment notes</label>
      <Textarea
        value={value}
        onChange={e => handleChange(e.target.value)}
        placeholder="Auditor's overall narrative for this standard area..."
        rows={3}
        className="text-xs"
      />
    </div>
  );
}
