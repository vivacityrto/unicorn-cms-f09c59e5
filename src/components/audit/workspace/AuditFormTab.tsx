import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Plus, Info } from 'lucide-react';
import { useAuditSections, useInitializeSections, useAuditQuestions, useAuditResponses, useAuditFindings, useAuditScore } from '@/hooks/useAuditWorkspace';
import { useAuth } from '@/hooks/useAuth';
import { QuestionCard } from './QuestionCard';
import { AddFindingForm } from './AddFindingForm';
import type { ClientAudit } from '@/types/clientAudits';
import type { TemplateQuestion, AuditResponse } from '@/types/auditWorkspace';

interface AuditFormTabProps {
  audit: ClientAudit;
}

export function AuditFormTab({ audit }: AuditFormTabProps) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { data: sections, isLoading: sectionsLoading } = useAuditSections(audit.id);
  const initSections = useInitializeSections(audit.id);
  const { data: responses, upsertResponse } = useAuditResponses(audit.id);
  const { createFinding } = useAuditFindings(audit.id);
  const [initialized, setInitialized] = useState(false);

  // Initialize sections if empty
  useEffect(() => {
    if (sectionsLoading || initialized) return;
    if (sections && sections.length === 0) {
      initSections.mutate({ templateId: audit.template_id });
      setInitialized(true);
    }
  }, [sections, sectionsLoading, initialized, audit.template_id]);

  const isTemplate = !!audit.template_id;

  if (sectionsLoading) {
    return <div className="text-sm text-muted-foreground p-4">Loading sections...</div>;
  }

  if (!isTemplate) {
    return (
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm flex items-start gap-2">
          <Info className="h-4 w-4 text-blue-600 mt-0.5" />
          <p className="text-blue-800">
            This audit uses the SRTO 2025 standards reference. Questions are freeform — add findings directly against each standard area.
          </p>
        </div>
        {sections?.map((section) => (
          <FreeformSection
            key={section.id}
            sectionId={section.id}
            title={section.title}
            auditId={audit.id}
            onAddFinding={(f: any) => createFinding.mutate(f)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sections?.map((section) => (
        <TemplateSectionBlock
          key={section.id}
          section={section}
          audit={audit}
          responses={responses || []}
          userId={userId}
          onUpsertResponse={upsertResponse.mutate}
          onAddFinding={(f: any) => createFinding.mutate(f)}
        />
      ))}
    </div>
  );
}

function FreeformSection({
  sectionId,
  title,
  auditId,
  onAddFinding,
}: {
  sectionId: string;
  title: string;
  auditId: string;
  onAddFinding: (f: any) => void;
}) {
  const [open, setOpen] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const { data: findings } = useAuditFindings(auditId);
  const sectionFindings = findings?.filter(f => f.section_id === sectionId) || [];

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setOpen(!open)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{title}</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setShowForm(true); }}>
              <Plus className="h-3 w-3 mr-1" /> Add Finding
            </Button>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          {sectionFindings.length === 0 && !showForm && (
            <p className="text-xs text-muted-foreground">
              No template questions for this standard area. Review evidence and add findings manually.
            </p>
          )}
          {sectionFindings.map(f => (
            <div key={f.id} className="bg-muted/50 rounded p-2 text-xs">
              <p className="font-medium">{f.summary}</p>
              {f.standard_reference && <p className="text-muted-foreground">{f.standard_reference}</p>}
            </div>
          ))}
          {showForm && (
            <AddFindingForm
              auditId={auditId}
              sectionId={sectionId}
              onSave={(f) => { onAddFinding(f); setShowForm(false); }}
              onCancel={() => setShowForm(false)}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}

function TemplateSectionBlock({
  section,
  audit,
  responses,
  userId,
  onUpsertResponse,
  onAddFinding,
}: {
  section: any;
  audit: ClientAudit;
  responses: AuditResponse[];
  userId: string | undefined;
  onUpsertResponse: (data: any) => void;
  onAddFinding: (f: any) => void;
}) {
  const [open, setOpen] = useState(true);
  const { data: questions } = useAuditQuestions(section.template_section_id);

  // Calculate score for this section
  useAuditScore(audit.id, responses, questions || undefined);

  const sectionResponses = responses.filter(r => r.section_id === section.id);
  const answeredCount = sectionResponses.filter(r => r.rating).length;
  const totalCount = questions?.length ?? 0;

  const handleRate = (questionId: string, rating: string, score: number, isFlagged: boolean) => {
    if (!userId) return;
    onUpsertResponse({
      audit_id: audit.id,
      section_id: section.id,
      question_id: questionId,
      rating,
      score,
      is_flagged: isFlagged,
      responded_by: userId,
    });
  };

  const handleNote = (questionId: string, notesValue: string) => {
    if (!userId) return;
    const existing = responses.find(r => r.question_id === questionId);
    onUpsertResponse({
      audit_id: audit.id,
      section_id: section.id,
      question_id: questionId,
      rating: existing?.rating || null,
      notes: notesValue,
      score: existing?.score || null,
      is_flagged: existing?.is_flagged || false,
      responded_by: userId,
    });
  };

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setOpen(!open)}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">{section.title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {answeredCount} of {totalCount} answered
            </p>
          </div>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          {questions?.map(q => (
            <QuestionCard
              key={q.id}
              question={q}
              response={responses.find(r => r.question_id === q.id)}
              auditId={audit.id}
              sectionId={section.id}
              onRate={handleRate}
              onNote={handleNote}
              onAddFinding={onAddFinding}
            />
          ))}
          {(!questions || questions.length === 0) && (
            <p className="text-xs text-muted-foreground p-4 text-center">
              No questions available for this section.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
