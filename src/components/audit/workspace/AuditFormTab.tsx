import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Plus, Info } from 'lucide-react';
import { useAuditSections, useInitializeSections, useAuditQuestions, useAuditResponses, useAuditFindings, useAuditScore, useUpdateSectionSummary, useUpdateSectionRiskLevel } from '@/hooks/useAuditWorkspace';
import { useAuth } from '@/hooks/useAuth';
import { QuestionCard } from './QuestionCard';
import { AddFindingForm } from './AddFindingForm';
import { PhaseStepIndicator } from './PhaseStepIndicator';
import { OpeningMeetingPhase } from './OpeningMeetingPhase';
import { DocumentReviewPhase } from './DocumentReviewPhase';
import { ClosingMeetingPhase } from './ClosingMeetingPhase';
import type { ClientAudit } from '@/types/clientAudits';
import type { TemplateQuestion, AuditResponse, AuditPhase, AuditSection } from '@/types/auditWorkspace';

interface AuditFormTabProps {
  audit: ClientAudit;
  selectedSectionId?: string;
}

export function AuditFormTab({ audit, selectedSectionId }: AuditFormTabProps) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { data: sections, isLoading: sectionsLoading } = useAuditSections(audit.id);
  const initSections = useInitializeSections(audit.id);
  const { data: responses, upsertResponse } = useAuditResponses(audit.id);
  const { createFinding } = useAuditFindings(audit.id);
  const updateSummary = useUpdateSectionSummary(audit.id);
  const updateRiskLevel = useUpdateSectionRiskLevel(audit.id);
  const [initialized, setInitialized] = useState(false);
  const [activePhase, setActivePhase] = useState<AuditPhase>('opening_meeting');

  // Load questions for all template sections
  const templateSectionIds = sections?.filter(s => s.template_section_id).map(s => s.template_section_id!) || [];

  useEffect(() => {
    if (sectionsLoading || initialized) return;
    if (sections && sections.length === 0) {
      initSections.mutate({ templateId: audit.template_id });
      setInitialized(true);
    }
  }, [sections, sectionsLoading, initialized, audit.template_id]);

  // Auto-navigate to phase when section is selected
  useEffect(() => {
    if (!selectedSectionId || !sections) return;
    const section = sections.find(s => s.id === selectedSectionId);
    if (section?.audit_phase) {
      setActivePhase(section.audit_phase);
    }
  }, [selectedSectionId, sections]);

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

  // Group sections by phase
  const openingSections = sections?.filter(s => s.audit_phase === 'opening_meeting') || [];
  const reviewSections = sections?.filter(s => s.audit_phase === 'document_review') || [];
  const closingSections = sections?.filter(s => s.audit_phase === 'closing_meeting') || [];

  return (
    <TemplatePhaseView
      audit={audit}
      sections={sections || []}
      responses={responses || []}
      openingSections={openingSections}
      reviewSections={reviewSections}
      closingSections={closingSections}
      activePhase={activePhase}
      setActivePhase={setActivePhase}
      userId={userId}
      onUpsertResponse={upsertResponse.mutate}
      onAddFinding={(f: any) => createFinding.mutate(f)}
      onUpdateSummary={(sectionId, summary) => updateSummary.mutate({ sectionId, summary })}
      onUpdateRiskLevel={(sectionId, riskLevel) => updateRiskLevel.mutate({ sectionId, riskLevel })}
      selectedSectionId={selectedSectionId}
    />
  );
}

function TemplatePhaseView({
  audit,
  sections,
  responses,
  openingSections,
  reviewSections,
  closingSections,
  activePhase,
  setActivePhase,
  userId,
  onUpsertResponse,
  onAddFinding,
  onUpdateSummary,
  onUpdateRiskLevel,
  selectedSectionId,
}: {
  audit: ClientAudit;
  sections: AuditSection[];
  responses: AuditResponse[];
  openingSections: AuditSection[];
  reviewSections: AuditSection[];
  closingSections: AuditSection[];
  activePhase: AuditPhase;
  setActivePhase: (phase: AuditPhase) => void;
  userId: string | undefined;
  onUpsertResponse: (data: any) => void;
  onAddFinding: (f: any) => void;
  onUpdateSummary: (sectionId: string, summary: string) => void;
  onUpdateRiskLevel: (sectionId: string, riskLevel: string) => void;
  selectedSectionId?: string;
}) {
  // Load ALL questions for all sections using individual hooks
  // We need to collect questions per template_section_id
  const allTemplateSectionIds = sections.filter(s => s.template_section_id).map(s => s.template_section_id!);
  
  // Use a single component that loads questions for each section
  return (
    <div className="space-y-4">
      {allTemplateSectionIds.map(tsId => (
        <QuestionLoader key={tsId} templateSectionId={tsId} />
      ))}
      <TemplatePhaseViewInner
        audit={audit}
        sections={sections}
        responses={responses}
        openingSections={openingSections}
        reviewSections={reviewSections}
        closingSections={closingSections}
        activePhase={activePhase}
        setActivePhase={setActivePhase}
        userId={userId}
        onUpsertResponse={onUpsertResponse}
        onAddFinding={onAddFinding}
        onUpdateSummary={onUpdateSummary}
        onUpdateRiskLevel={onUpdateRiskLevel}
        selectedSectionId={selectedSectionId}
      />
    </div>
  );
}

// Invisible component that triggers question loading for a template section
function QuestionLoader({ templateSectionId }: { templateSectionId: string }) {
  useAuditQuestions(templateSectionId);
  return null;
}

function TemplatePhaseViewInner({
  audit,
  sections,
  responses,
  openingSections,
  reviewSections,
  closingSections,
  activePhase,
  setActivePhase,
  userId,
  onUpsertResponse,
  onAddFinding,
  onUpdateSummary,
  onUpdateRiskLevel,
  selectedSectionId,
}: {
  audit: ClientAudit;
  sections: AuditSection[];
  responses: AuditResponse[];
  openingSections: AuditSection[];
  reviewSections: AuditSection[];
  closingSections: AuditSection[];
  activePhase: AuditPhase;
  setActivePhase: (phase: AuditPhase) => void;
  userId: string | undefined;
  onUpsertResponse: (data: any) => void;
  onAddFinding: (f: any) => void;
  onUpdateSummary: (sectionId: string, summary: string) => void;
  onUpdateRiskLevel: (sectionId: string, riskLevel: string) => void;
  selectedSectionId?: string;
}) {
  // Build questionsBySection from react-query cache
  // We need to access cached question data
  const questionsBySection: Record<string, TemplateQuestion[]> = {};
  
  // Load questions for each section - use hooks at top level
  const questionQueries = sections
    .filter(s => s.template_section_id)
    .map(s => {
      const { data } = useAuditQuestions(s.template_section_id);
      return { templateSectionId: s.template_section_id!, questions: data || [] };
    });

  for (const q of questionQueries) {
    questionsBySection[q.templateSectionId] = q.questions;
  }

  // Calculate phase completions
  const getPhaseStats = (phaseSections: AuditSection[]) => {
    let total = 0;
    let answered = 0;
    for (const s of phaseSections) {
      const qs = questionsBySection[s.template_section_id || ''] || [];
      total += qs.length;
      answered += qs.filter(q => responses.find(r => r.question_id === q.id && r.rating)).length;
    }
    return { total, answered, isComplete: total > 0 && answered === total };
  };

  const openingStats = getPhaseStats(openingSections);
  const reviewStats = getPhaseStats(reviewSections);
  const closingStats = getPhaseStats(closingSections);

  // Score calculation using document review questions only
  const allReviewQuestions = reviewSections.flatMap(s => questionsBySection[s.template_section_id || ''] || []);
  useAuditScore(audit.id, responses, allReviewQuestions.length > 0 ? allReviewQuestions : undefined);

  const phases = [
    { key: 'opening_meeting' as AuditPhase, label: 'Opening Meeting', number: 1, ...openingStats, questionCount: openingStats.total, answeredCount: openingStats.answered },
    { key: 'document_review' as AuditPhase, label: 'Document Review', number: 2, ...reviewStats, questionCount: reviewStats.total, answeredCount: reviewStats.answered },
    { key: 'closing_meeting' as AuditPhase, label: 'Closing Meeting', number: 3, ...closingStats, questionCount: closingStats.total, answeredCount: closingStats.answered },
  ];

  return (
    <>
      <PhaseStepIndicator
        phases={phases}
        activePhase={activePhase}
        onPhaseClick={setActivePhase}
      />

      {activePhase === 'opening_meeting' && (
        <OpeningMeetingPhase
          sections={openingSections}
          responses={responses}
          questionsBySection={questionsBySection}
          userId={userId}
          auditId={audit.id}
          onUpsertResponse={onUpsertResponse}
          onAddFinding={onAddFinding}
          onUpdateSummary={onUpdateSummary}
        />
      )}

      {activePhase === 'document_review' && (
        <DocumentReviewPhase
          sections={reviewSections}
          responses={responses}
          questionsBySection={questionsBySection}
          userId={userId}
          auditId={audit.id}
          onUpsertResponse={onUpsertResponse}
          onAddFinding={onAddFinding}
          onUpdateSummary={onUpdateSummary}
          onUpdateRiskLevel={onUpdateRiskLevel}
          selectedSectionId={selectedSectionId}
        />
      )}

      {activePhase === 'closing_meeting' && (
        <ClosingMeetingPhase
          sections={closingSections}
          responses={responses}
          questionsBySection={questionsBySection}
          userId={userId}
          auditId={audit.id}
          onUpsertResponse={onUpsertResponse}
          onAddFinding={onAddFinding}
          onUpdateSummary={onUpdateSummary}
        />
      )}
    </>
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
