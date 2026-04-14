import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { SectionNav } from '@/components/compliance-audit/SectionNav';
import { QuestionCard } from '@/components/compliance-audit/QuestionCard';
import { Check, ArrowLeft } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchAuditFormData,
  saveResponse,
  recalculateScore,
  completeAudit,
  upsertCAA,
  uploadEvidence,
  type ComplianceAuditRow,
  type ComplianceSection,
  type ComplianceQuestion,
  type ComplianceResponse,
  type ComplianceCAA,
} from '@/hooks/useComplianceAudits';

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In Progress', className: 'bg-warning/10 text-warning' },
  complete: { label: 'Complete', className: 'bg-success/10 text-success' },
};

export default function ComplianceAuditForm() {
  const { tenantId, auditId } = useParams<{ tenantId: string; auditId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [audit, setAudit] = useState<ComplianceAuditRow | null>(null);
  const [sections, setSections] = useState<ComplianceSection[]>([]);
  const [questions, setQuestions] = useState<ComplianceQuestion[]>([]);
  const [responses, setResponses] = useState<ComplianceResponse[]>([]);
  const [caas, setCaas] = useState<ComplianceCAA[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [scoreInfo, setScoreInfo] = useState({ total: 0, max: 0, pct: 0 });
  const saveTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});

  const totalQuestions = questions.length;
  const answeredQuestions = responses.filter(r => r.response !== null).length;
  const isReadOnly = audit?.status === 'complete';

  useEffect(() => {
    loadData();
    if (tenantId) {
      supabase
        .from('tenants')
        .select('name')
        .eq('id', parseInt(tenantId, 10))
        .single()
        .then(({ data }) => setTenantName(data?.name || ''));
    }
  }, [auditId]);

  const loadData = async () => {
    if (!auditId) return;
    setLoading(true);
    try {
      const data = await fetchAuditFormData(auditId);
      setAudit(data.audit);
      setSections(data.sections);
      setQuestions(data.questions);
      setResponses(data.responses);
      setCaas(data.caas);
      if (data.sections.length > 0 && !activeSectionId) {
        setActiveSectionId(data.sections[0].id);
      }
      // Calculate current score
      let t = 0, m = 0;
      for (const r of data.responses) {
        if (!r.response || r.response === 'na' || r.response === 'not_applicable') continue;
        t += r.score || 0;
        m += 2;
      }
      setScoreInfo({ total: t, max: m, pct: m > 0 ? Math.round((t / m) * 100) : 0 });
    } catch (err: any) {
      toast({ title: 'Error loading audit', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleResponseChange = useCallback(async (questionId: string, responseId: string, value: string) => {
    if (!user?.id || !auditId) return;

    const question = questions.find(q => q.id === questionId);
    if (!question) return;

    // Calculate score
    let score = 0;
    if (value === 'safe' || value === 'compliant') score = question.score_compliant;
    else if (value === 'at_risk') score = question.score_at_risk;
    else if (value === 'non_compliant') score = question.score_non_compliant;

    const isFlagged = question.flagged_responses.includes(value);

    // Update local state immediately
    setResponses(prev => prev.map(r =>
      r.id === responseId ? { ...r, response: value, score, is_flagged: isFlagged } : r
    ));

    // Auto-save
    try {
      setSaving(true);
      await saveResponse({
        responseId,
        response: value,
        score,
        isFlagged,
        respondedBy: user.id,
      });

      // Update audit status to in_progress if draft
      if (audit?.status === 'draft') {
        await supabase
          .from('compliance_audits')
          .update({ status: 'in_progress' })
          .eq('id', auditId);
        setAudit(prev => prev ? { ...prev, status: 'in_progress' } : null);
      }

      // Recalculate score
      const newScore = await recalculateScore(auditId);
      setScoreInfo({ total: newScore.scoreTotal, max: newScore.scoreMax, pct: newScore.scorePct || 0 });
    } catch (err: any) {
      toast({ title: 'Save error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [questions, user, auditId, audit?.status]);

  const handleNotesChange = useCallback((responseId: string, notes: string) => {
    setResponses(prev => prev.map(r =>
      r.id === responseId ? { ...r, notes } : r
    ));

    // Debounce save
    if (saveTimeoutRef.current[responseId]) {
      clearTimeout(saveTimeoutRef.current[responseId]);
    }
    saveTimeoutRef.current[responseId] = setTimeout(async () => {
      const resp = responses.find(r => r.id === responseId);
      if (!resp || !user?.id) return;
      try {
        await saveResponse({
          responseId,
          response: resp.response,
          score: resp.score,
          isFlagged: resp.is_flagged,
          notes,
          respondedBy: user.id,
        });
      } catch (err: any) {
        console.error('Notes save error:', err);
      }
    }, 1000);
  }, [responses, user]);

  const handleEvidenceUpload = useCallback(async (questionId: string, responseId: string, file: File) => {
    if (!auditId) return;
    try {
      const url = await uploadEvidence(file, auditId, questionId);
      setResponses(prev => prev.map(r => {
        if (r.id !== responseId) return r;
        const urls = [...(r.evidence_urls || []), url];
        // Save with updated urls
        if (user?.id) {
          saveResponse({
            responseId,
            response: r.response,
            score: r.score,
            isFlagged: r.is_flagged,
            notes: r.notes,
            evidenceUrls: urls,
            respondedBy: user.id,
          });
        }
        return { ...r, evidence_urls: urls };
      }));
      toast({ title: 'Evidence uploaded' });
    } catch (err: any) {
      toast({ title: 'Upload error', description: err.message, variant: 'destructive' });
    }
  }, [auditId, user]);

  const handleCAAChange = useCallback(async (data: {
    responseId: string;
    description: string;
    responsiblePerson: string | null;
    dueDate: string | null;
    existingCaaId?: string;
  }) => {
    if (!auditId || !user?.id) return;
    try {
      const caaId = await upsertCAA({
        auditId,
        responseId: data.responseId,
        description: data.description,
        responsiblePerson: data.responsiblePerson,
        dueDate: data.dueDate,
        createdBy: user.id,
        existingCaaId: data.existingCaaId,
      });
      setCaas(prev => {
        const existing = prev.find(c => c.id === caaId);
        if (existing) {
          return prev.map(c => c.id === caaId ? {
            ...c,
            description: data.description,
            responsible_person: data.responsiblePerson,
            due_date: data.dueDate,
          } : c);
        }
        return [...prev, {
          id: caaId,
          audit_id: auditId,
          response_id: data.responseId,
          description: data.description,
          responsible_person: data.responsiblePerson,
          due_date: data.dueDate,
          status: 'open',
          verified_by: null,
          verified_at: null,
          evidence_urls: null,
          notes: null,
          created_by: user.id,
        }];
      });
    } catch (err: any) {
      toast({ title: 'Error saving corrective action', description: err.message, variant: 'destructive' });
    }
  }, [auditId, user]);

  const handleComplete = async () => {
    if (!auditId) return;
    setCompleting(true);
    try {
      const success = await completeAudit(auditId);
      if (success) {
        toast({ title: 'Audit completed!', description: 'Redirecting to report...' });
        navigate(`/compliance-audits/${tenantId}/audit/${auditId}/report`);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setCompleting(false);
    }
  };

  // Get questions for active section
  const activeQuestions = activeSectionId
    ? questions.filter(q => q.section_id === activeSectionId).sort((a, b) => a.sort_order - b.sort_order)
    : [];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96 text-muted-foreground">Loading audit...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-64px)]">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 bg-background border-b px-6 py-3">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/compliance-audits/${tenantId}`)}
                className="gap-1"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div>
                <h1 className="text-lg font-semibold text-foreground">{tenantName}</h1>
                <p className="text-xs text-muted-foreground">
                  {audit?.audit_date ? `Audit: ${audit.audit_date}` : 'Draft Audit'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{answeredQuestions}/{totalQuestions}</span>
                <Progress value={(answeredQuestions / Math.max(totalQuestions, 1)) * 100} className="w-24 h-2" />
              </div>
              {scoreInfo.max > 0 && (
                <span className="text-sm font-medium">{scoreInfo.pct}%</span>
              )}
              <Badge className={STATUS_BADGE[audit?.status || 'draft']?.className}>
                {STATUS_BADGE[audit?.status || 'draft']?.label}
              </Badge>
              {saving && (
                <span className="text-xs text-muted-foreground animate-pulse">Saving...</span>
              )}
              <Button
                onClick={handleComplete}
                isLoading={completing}
                disabled={answeredQuestions < totalQuestions || isReadOnly}
                className="gap-1"
              >
                <Check className="h-4 w-4" />
                Complete Audit
              </Button>
            </div>
          </div>
        </div>

        {/* Body: Sidebar + Content */}
        <div className="flex flex-1 overflow-hidden max-w-7xl mx-auto w-full">
          {/* Section Navigator */}
          <div className="w-64 shrink-0 border-r overflow-y-auto py-4 px-3">
            <SectionNav
              sections={sections}
              questions={questions}
              responses={responses}
              activeSectionId={activeSectionId}
              onSectionClick={setActiveSectionId}
            />
          </div>

          {/* Question Cards */}
          <div className="flex-1 overflow-y-auto py-6 px-6">
            <div className="space-y-4 max-w-3xl">
              {activeSectionId && (
                <h2 className="text-lg font-semibold text-foreground mb-4">
                  {sections.find(s => s.id === activeSectionId)?.title}
                </h2>
              )}
              {activeQuestions.map(question => {
                const response = responses.find(r => r.question_id === question.id);
                const caa = caas.find(c => c.response_id === response?.id);
                return (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    response={response}
                    caa={caa}
                    onResponseChange={handleResponseChange}
                    onNotesChange={handleNotesChange}
                    onEvidenceUpload={handleEvidenceUpload}
                    onCAAChange={handleCAAChange}
                    isReadOnly={isReadOnly}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
