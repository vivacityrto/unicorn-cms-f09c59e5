import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScoreGauge } from '@/components/compliance-audit/ScoreGauge';
import { CAATracker } from '@/components/compliance-audit/CAATracker';
import { ArrowLeft, FileDown, Edit } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchAuditFormData,
  updateCAAStatus,
  type ComplianceAuditRow,
  type ComplianceSection,
  type ComplianceQuestion,
  type ComplianceResponse,
  type ComplianceCAA,
} from '@/hooks/useComplianceAudits';

const RESPONSE_LABELS: Record<string, { label: string; className: string }> = {
  safe: { label: 'Safe', className: 'bg-accent/10 text-accent' },
  compliant: { label: 'Compliant', className: 'bg-accent/10 text-accent' },
  at_risk: { label: 'At Risk', className: 'bg-warning/10 text-warning' },
  non_compliant: { label: 'Non-Compliant', className: 'bg-destructive/10 text-destructive' },
  na: { label: 'N/A', className: 'bg-muted text-muted-foreground' },
  not_applicable: { label: 'N/A', className: 'bg-muted text-muted-foreground' },
};

export default function ComplianceAuditReport() {
  const { tenantId, auditId } = useParams<{ tenantId: string; auditId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [audit, setAudit] = useState<ComplianceAuditRow | null>(null);
  const [sections, setSections] = useState<ComplianceSection[]>([]);
  const [questions, setQuestions] = useState<ComplianceQuestion[]>([]);
  const [responses, setResponses] = useState<ComplianceResponse[]>([]);
  const [caas, setCaas] = useState<ComplianceCAA[]>([]);
  const [tenantName, setTenantName] = useState('');
  const [auditorName, setAuditorName] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [auditId]);

  const loadData = async () => {
    if (!auditId || !tenantId) return;
    setLoading(true);
    try {
      const data = await fetchAuditFormData(auditId);
      setAudit(data.audit);
      setSections(data.sections);
      setQuestions(data.questions);
      setResponses(data.responses);
      setCaas(data.caas);

      // Tenant name
      const { data: tenant } = await supabase
        .from('tenants')
        .select('name, rto_id')
        .eq('id', parseInt(tenantId, 10))
        .single();
      setTenantName(tenant?.name || '');

      // Template name
      const { data: tpl } = await supabase
        .from('compliance_templates')
        .select('name')
        .eq('id', data.audit.template_id)
        .single();
      setTemplateName(tpl?.name || '');

      // Auditor name
      if (data.audit.auditor_user_id) {
        const { data: u } = await supabase
          .from('users')
          .select('first_name, last_name')
          .eq('user_uuid', data.audit.auditor_user_id)
          .single();
        setAuditorName(u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : '—');
      }
    } catch (err: any) {
      toast({ title: 'Error loading report', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCAAStatusChange = async (caaId: string, status: string, verifiedBy?: string) => {
    try {
      await updateCAAStatus(caaId, status, verifiedBy);
      setCaas(prev => prev.map(c =>
        c.id === caaId ? {
          ...c,
          status,
          verified_by: verifiedBy || c.verified_by,
          verified_at: status === 'closed' ? new Date().toISOString() : c.verified_at,
        } : c
      ));
      toast({ title: 'Status updated' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  // Section score summary
  const getSectionSummary = (sectionId: string) => {
    const sectionQs = questions.filter(q => q.section_id === sectionId);
    const sectionRs = responses.filter(r => sectionQs.some(q => q.id === r.question_id));

    let compliant = 0, atRisk = 0, nonCompliant = 0, na = 0, scoreTotal = 0, scoreMax = 0;
    for (const r of sectionRs) {
      if (r.response === 'safe' || r.response === 'compliant') { compliant++; scoreTotal += r.score || 0; scoreMax += 2; }
      else if (r.response === 'at_risk') { atRisk++; scoreTotal += r.score || 0; scoreMax += 2; }
      else if (r.response === 'non_compliant') { nonCompliant++; scoreTotal += r.score || 0; scoreMax += 2; }
      else if (r.response === 'na' || r.response === 'not_applicable') { na++; }
    }
    return { total: sectionQs.length, compliant, atRisk, nonCompliant, na, scoreTotal, scoreMax };
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96 text-muted-foreground">Loading report...</div>
      </DashboardLayout>
    );
  }

  const isComplete = audit?.status === 'complete';
  const scorePct = audit?.score_pct ?? 0;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-8">
        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/compliance-audits/${tenantId}`)}
            className="gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Audit List
          </Button>
          <div className="flex items-center gap-2">
            {!isComplete && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => navigate(`/compliance-audits/${tenantId}/audit/${auditId}`)}
              >
                <Edit className="h-4 w-4" />
                Edit Responses
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1" disabled>
              <FileDown className="h-4 w-4" />
              Export PDF
            </Button>
          </div>
        </div>

        {/* Banner */}
        {isComplete && (
          <div className="bg-success/10 border border-success/20 rounded-lg px-4 py-3 text-sm text-success font-medium">
            ✓ This audit is complete. Report is read-only.
          </div>
        )}

        {/* Report Header */}
        <div className="border rounded-xl bg-card p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">{tenantName}</h1>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Template: <span className="text-foreground font-medium">{templateName}</span></p>
                <p>Audit Date: <span className="text-foreground font-medium">
                  {audit?.audit_date ? format(new Date(audit.audit_date), 'dd MMM yyyy') : '—'}
                </span></p>
                <p>Auditor: <span className="text-foreground font-medium">{auditorName}</span></p>
              </div>
            </div>
            <ScoreGauge score={Number(scorePct)} />
          </div>
        </div>

        {/* Score Summary Table */}
        <div className="border rounded-xl bg-card overflow-hidden">
          <h3 className="text-lg font-semibold text-foreground p-5 pb-3">Score Summary</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Section</TableHead>
                <TableHead className="text-center">Questions</TableHead>
                <TableHead className="text-center">Compliant</TableHead>
                <TableHead className="text-center">At Risk</TableHead>
                <TableHead className="text-center">Non-Compliant</TableHead>
                <TableHead className="text-center">N/A</TableHead>
                <TableHead className="text-center">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sections.map(section => {
                const s = getSectionSummary(section.id);
                const sectionPct = s.scoreMax > 0 ? Math.round((s.scoreTotal / s.scoreMax) * 100) : 0;
                return (
                  <TableRow key={section.id}>
                    <TableCell className="font-medium text-sm">{section.title}</TableCell>
                    <TableCell className="text-center text-sm">{s.total}</TableCell>
                    <TableCell className="text-center text-sm text-accent">{s.compliant}</TableCell>
                    <TableCell className="text-center text-sm text-warning">{s.atRisk}</TableCell>
                    <TableCell className="text-center text-sm text-destructive">{s.nonCompliant}</TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">{s.na}</TableCell>
                    <TableCell className="text-center text-sm font-medium">
                      {s.scoreMax > 0 ? `${sectionPct}%` : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Findings by Section */}
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-foreground">Findings by Section</h3>
          {sections.map(section => {
            const sectionQs = questions.filter(q => q.section_id === section.id).sort((a, b) => a.sort_order - b.sort_order);
            return (
              <div key={section.id} className="border rounded-xl bg-card p-5">
                <h4 className="text-base font-semibold text-foreground mb-4">{section.title}</h4>
                <div className="space-y-3">
                  {sectionQs.map(question => {
                    const response = responses.find(r => r.question_id === question.id);
                    const caa = caas.find(c => c.response_id === response?.id);
                    const rInfo = RESPONSE_LABELS[response?.response || ''];
                    return (
                      <div key={question.id} className="border-b border-border/50 pb-3 last:border-0 last:pb-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              {question.clause && (
                                <span className="text-xs font-mono font-semibold text-primary">{question.clause}</span>
                              )}
                              <span className="text-sm text-foreground">{question.audit_statement}</span>
                            </div>
                            {response?.notes && (
                              <p className="text-xs text-muted-foreground mt-1 italic">Note: {response.notes}</p>
                            )}
                          </div>
                          {rInfo && (
                            <Badge className={rInfo.className}>{rInfo.label}</Badge>
                          )}
                        </div>
                        {caa && (
                          <div className="mt-2 ml-4 p-3 bg-destructive/5 rounded-lg border border-destructive/10 text-sm">
                            <p className="font-medium text-destructive text-xs mb-1">Corrective Action:</p>
                            <p className="text-foreground/80 text-xs">{caa.description}</p>
                            {caa.responsible_person && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Responsible: {caa.responsible_person}
                                {caa.due_date && ` | Due: ${format(new Date(caa.due_date), 'dd MMM yyyy')}`}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* CAA Tracker */}
        <div className="border rounded-xl bg-card p-5">
          <CAATracker
            caas={caas}
            questions={questions}
            responses={responses}
            onStatusChange={handleCAAStatusChange}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
