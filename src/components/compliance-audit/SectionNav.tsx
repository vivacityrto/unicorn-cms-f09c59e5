import { cn } from '@/lib/utils';
import { Check, AlertTriangle } from 'lucide-react';
import type { ComplianceSection, ComplianceQuestion, ComplianceResponse } from '@/hooks/useComplianceAudits';

interface SectionNavProps {
  sections: ComplianceSection[];
  questions: ComplianceQuestion[];
  responses: ComplianceResponse[];
  activeSectionId: string | null;
  onSectionClick: (sectionId: string) => void;
}

export function SectionNav({ sections, questions, responses, activeSectionId, onSectionClick }: SectionNavProps) {
  return (
    <nav className="space-y-1">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">
        Sections
      </h3>
      {sections.map((section) => {
        const sectionQuestions = questions.filter(q => q.section_id === section.id);
        const sectionResponses = responses.filter(r =>
          sectionQuestions.some(q => q.id === r.question_id)
        );
        const answered = sectionResponses.filter(r => r.response !== null).length;
        const total = sectionQuestions.length;
        const isComplete = total > 0 && answered === total;
        const hasFlagged = sectionResponses.some(r => r.is_flagged);
        const isActive = section.id === activeSectionId;

        return (
          <button
            key={section.id}
            onClick={() => onSectionClick(section.id)}
            className={cn(
              'w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 flex items-center gap-2',
              isActive
                ? 'bg-primary/10 text-primary font-medium ring-1 ring-primary/20'
                : 'hover:bg-muted/50 text-foreground/80'
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium text-xs">{section.title}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {answered}/{total} answered
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {hasFlagged && (
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              )}
              {isComplete && (
                <Check className="h-3.5 w-3.5 text-success" />
              )}
            </div>
          </button>
        );
      })}
    </nav>
  );
}
