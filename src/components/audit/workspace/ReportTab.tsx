import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileText, Download, Clock, Send, CheckCircle2, AlertTriangle, Shield, X, Info, Mail, Sparkles, Copy, Loader2 } from 'lucide-react';
import { SendPreliminarySummaryDialog } from './SendPreliminarySummaryDialog';
import { AuditRiskBadge } from '@/components/audit/AuditRiskBadge';
import {
  useReleaseReport,
  useRevokeReport,
  useDraftExecutiveSummary,
  useRecordExecutiveSummaryDecision,
  useGenerateClientAuditReport,
  useGenerateClientAuditReportDocx,
  type ExecSummaryResponse,
} from '@/hooks/useAuditReport';
import { supabase } from '@/integrations/supabase/client';
import { useAuditActions, useUpdateAudit } from '@/hooks/useAuditWorkspace';
import { useAuditAppointments } from '@/hooks/useAuditSchedule';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { ClientAudit } from '@/types/clientAudits';
import type { AuditFinding, AuditAction } from '@/types/auditWorkspace';
import { useAuditProgress } from '@/hooks/useAuditCompletion';
import { usePermission } from '@/hooks/usePermission';
import { toast } from 'sonner';

// Levenshtein-style edit distance percent (0-100). Cheap implementation —
// we only need it for a coarse "how much did the auditor change" telemetry
// signal, not for diffing.
function editDistancePct(original: string, edited: string): number {
  if (original === edited) return 0;
  if (!original) return edited.length > 0 ? 100 : 0;
  const a = original;
  const b = edited;
  const m = a.length;
  const n = b.length;
  // Bounded matrix to keep memory sane on long summaries.
  if (m * n > 1_000_000) {
    // Fallback: rough length-delta proxy.
    return Math.min(100, Math.round((Math.abs(m - n) / Math.max(m, n)) * 100));
  }
  const dp: number[] = Array(n + 1).fill(0).map((_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return Math.min(100, Math.round((dp[n] / Math.max(m, n)) * 100));
}

interface ReportTabProps {
  audit: ClientAudit;
  findings: AuditFinding[];
  actions: AuditAction[];
}

export function ReportTab({ audit, findings, actions }: ReportTabProps) {
  const [releaseNotes, setReleaseNotes] = useState('');
  const [preliminaryOpen, setPreliminaryOpen] = useState(false);
  const canReport = usePermission('audits.report');
  const [softGuardOpen, setSoftGuardOpen] = useState(false);
  const releaseReport = useReleaseReport(audit.id);
  const revokeReport = useRevokeReport(audit.id);
  const updateAudit = useUpdateAudit(audit.id);
  const draftExecSummary = useDraftExecutiveSummary(audit.id);
  const recordDecision = useRecordExecutiveSummaryDecision();
  const generateReport = useGenerateClientAuditReport(audit.id);
  const generateReportDocx = useGenerateClientAuditReportDocx(audit.id);
  const { openingMeeting, closingMeeting } = useAuditAppointments(audit.id);
  const { data: progress } = useAuditProgress(audit.id);
  const findingsRequired = progress?.findings_required ?? 0;
  const notesRequired = progress?.notes_required ?? 0;
  const incompleteCount = findingsRequired + notesRequired;

  // ─── AI draft local state ─────────────────────────────────────────
  // Drafts live in component state until the auditor accepts each field
  // (which writes to client_audits) or discards them. The action_plan_rollup
  // is render-only / clipboard-only — it never persists to client_audits.
  const [draft, setDraft] = useState<ExecSummaryResponse | null>(null);
  const [editedExec, setEditedExec] = useState('');
  const [editedFinding, setEditedFinding] = useState('');
  const [editedRationale, setEditedRationale] = useState('');
  const [decisions, setDecisions] = useState<{
    executive_summary?: 'accepted' | 'edited' | 'rejected';
    overall_finding?: 'accepted' | 'edited' | 'rejected';
    risk_rationale?: 'accepted' | 'edited' | 'rejected';
  }>({});

  const handleDraftClick = async () => {
    try {
      const res = await draftExecSummary.mutateAsync();
      setDraft(res);
      setEditedExec(res.draft.executive_summary);
      setEditedFinding(res.draft.overall_finding);
      setEditedRationale(res.draft.risk_rationale);
      setDecisions({});
      toast.success('Draft ready for review.');
    } catch {
      // useDraftExecutiveSummary already toasts the server message.
    }
  };

  const acceptField = (
    field: 'executive_summary' | 'overall_finding' | 'risk_rationale',
    original: string,
    edited: string,
  ) => {
    if (!draft) return;
    const decision: 'accepted' | 'edited' = original === edited ? 'accepted' : 'edited';
    updateAudit.mutate({ [field]: edited } as any, {
      onSuccess: () => {
        setDecisions((d) => ({ ...d, [field]: decision }));
        recordDecision.mutate({
          draft_log_id: draft.log_id,
          audit_id: audit.id,
          [field]: { decision, edit_distance_pct: editDistancePct(original, edited) },
        } as any);
        toast.success(decision === 'accepted' ? 'Accepted.' : 'Saved your edits.');
      },
      onError: (err: any) => toast.error('Save failed: ' + (err?.message || 'unknown')),
    });
  };

  const discardField = (
    field: 'executive_summary' | 'overall_finding' | 'risk_rationale',
  ) => {
    if (!draft) return;
    setDecisions((d) => ({ ...d, [field]: 'rejected' }));
    recordDecision.mutate({
      draft_log_id: draft.log_id,
      audit_id: audit.id,
      [field]: { decision: 'rejected', edit_distance_pct: null },
    } as any);
  };

  const copyRollupToClipboard = () => {
    if (!draft) return;
    const rollup = draft.draft.action_plan_rollup;
    const lines: string[] = [];
    lines.push(rollup.introduction, '');
    for (const group of rollup.priority_groups) {
      lines.push(`${group.priority.toUpperCase()} PRIORITY`);
      lines.push(group.narrative);
      for (const a of group.actions) lines.push(`  • ${a.summary}`);
      lines.push('');
    }
    lines.push(rollup.closing);
    navigator.clipboard.writeText(lines.join('\n'));
    toast.success('Action plan copied to clipboard.');
  };

  const handleGenerateClick = () => {
    if (incompleteCount > 0) {
      setSoftGuardOpen(true);
      return;
    }
    generateReport.mutate();
  };

  const proceedToGenerate = () => {
    setSoftGuardOpen(false);
    generateReport.mutate();
  };

  const handleDownloadPdf = async () => {
    const path = (audit as any).report_pdf_path as string | null | undefined;
    if (!path) {
      toast.error('No PDF available yet.');
      return;
    }
    const { data, error } = await supabase.storage
      .from('audit-reports')
      .createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      toast.error("Couldn't open the PDF. Try regenerating it.");
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const handleDownloadDocx = async () => {
    const path = (audit as any).report_docx_path as string | null | undefined;
    if (!path) {
      toast.error('No Word document available yet.');
      return;
    }
    const { data, error } = await supabase.storage
      .from('audit-reports')
      .createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      toast.error("Couldn't open the Word document. Try regenerating it.");
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const scrollToFirstIncomplete = () => {
    setSoftGuardOpen(false);
    // Best-effort: jump to the form tab. Sidebar amber dots will lead the eye.
    document.querySelector('[data-value="form"]')?.scrollIntoView({ behavior: 'smooth' });
  };

  const findingsByPriority = {
    critical: findings.filter(f => f.priority === 'critical').length,
    high: findings.filter(f => f.priority === 'high').length,
    medium: findings.filter(f => f.priority === 'medium').length,
    low: findings.filter(f => f.priority === 'low').length,
  };
  const openActions = actions.filter(a => a.status !== 'complete' && a.status !== 'cancelled').length;

  const isReleased = !!(audit as any).report_client_visible;
  const releasedAt = (audit as any).report_released_at;
  const acknowledgedAt = (audit as any).report_acknowledged_at;

  const openingComplete = openingMeeting?.status === 'completed';
  const closingComplete = closingMeeting?.status === 'completed';

  return (
    <div className="space-y-6">
      {/* Report Readiness */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report Readiness</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            {openingComplete
              ? <CheckCircle2 className="h-4 w-4 text-green-600" />
              : <Clock className="h-4 w-4 text-amber-500" />}
            <span>Opening meeting {openingComplete
              ? `completed${openingMeeting?.scheduled_date ? ` (${new Date(openingMeeting.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })})` : ''}`
              : 'not yet completed'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {closingComplete
              ? <CheckCircle2 className="h-4 w-4 text-green-600" />
              : <AlertTriangle className="h-4 w-4 text-amber-500" />}
            <span>Closing meeting {closingComplete
              ? 'completed'
              : 'not yet completed'}</span>
          </div>
          {!closingComplete && (
            <Alert className="mt-2 bg-muted/50">
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                You can generate a draft report now. The closing meeting section will be marked as pending until completed.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      {/* Preliminary Summary — info only, hidden once final report is released */}
      {!isReleased && (
        <Card className="border-dashed">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-muted p-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Preliminary summary</p>
                <p className="text-xs text-muted-foreground">
                  Email an interim snapshot to the client and interested parties at any point. You will be CC'd. Nothing is saved to the audit record.
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => setPreliminaryOpen(true)}>
              <Mail className="h-4 w-4 mr-2" />
              Send Preliminary Summary
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Report Generation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report Generation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {audit.report_generated_at ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-green-600">
                <FileText className="h-4 w-4" />
                Last generated: {new Date(audit.report_generated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
              <Button size="sm" variant="outline" onClick={handleDownloadPdf}>
                <Download className="h-3 w-3 mr-1" /> Download PDF
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" /> No report generated yet
            </div>
          )}
          <Button onClick={handleGenerateClick} disabled={generateReport.isPending || !canReport}>
            {generateReport.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating PDF report...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                {audit.report_generated_at ? 'Regenerate Report' : 'Generate Report'}
              </>
            )}
          </Button>
          {incompleteCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {incompleteCount} response(s) still need attention before this audit is complete.
            </p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={softGuardOpen} onOpenChange={setSoftGuardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This audit isn't complete yet</AlertDialogTitle>
            <AlertDialogDescription>
              {findingsRequired > 0 && (
                <span>
                  {findingsRequired} finding{findingsRequired === 1 ? '' : 's'} required
                </span>
              )}
              {findingsRequired > 0 && notesRequired > 0 && <span>, </span>}
              {notesRequired > 0 && (
                <span>
                  {notesRequired} note{notesRequired === 1 ? '' : 's'} required
                </span>
              )}
              . Generating the report now will mark these incomplete in the document. Continue anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={scrollToFirstIncomplete}>Review incomplete items</AlertDialogCancel>
            <AlertDialogAction onClick={proceedToGenerate}>Generate anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── AI-Drafted Executive Summary (Wave 4 #2) ─────────────── */}
      <Card className="border-[#7130A0]/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#7130A0]" />
            AI-drafted executive summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!draft && (
            <>
              <p className="text-sm text-muted-foreground">
                Synthesise the executive summary, overall finding, risk rationale, and an action-plan rollup from every finding in this audit. The draft is yours to accept, edit, or discard — nothing persists until you act on it.
              </p>
              <Button
                onClick={handleDraftClick}
                disabled={draftExecSummary.isPending || findings.length < 3}
                style={{ backgroundColor: '#7130A0' }}
                className="text-white hover:opacity-90"
              >
                {draftExecSummary.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Drafting…</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-2" /> Draft executive summary with AI</>
                )}
              </Button>
              {findings.length < 3 && (
                <p className="text-xs text-muted-foreground">
                  Requires at least 3 findings ({findings.length} so far).
                </p>
              )}
            </>
          )}

          {draft && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="capitalize">{draft.draft.confidence} confidence</Badge>
                <span>·</span>
                <span>{draft.source_summary.total_findings} findings synthesised</span>
                <span>·</span>
                <span>{draft.ai_metadata.model.split('/').pop()}</span>
              </div>

              {draft.draft.uncertainty_notes && (
                <Alert className="bg-amber-50 border-amber-200">
                  <Info className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-xs text-amber-800">
                    <span className="font-medium">Uncertainty notes: </span>{draft.draft.uncertainty_notes}
                  </AlertDescription>
                </Alert>
              )}

              {/* Executive Summary */}
              <DraftField
                label="Executive Summary"
                original={draft.draft.executive_summary}
                value={editedExec}
                onChange={setEditedExec}
                decision={decisions.executive_summary}
                onAccept={() => acceptField('executive_summary', draft.draft.executive_summary, editedExec)}
                onDiscard={() => discardField('executive_summary')}
                rows={10}
              />

              {/* Overall Finding */}
              <DraftField
                label="Overall Finding"
                original={draft.draft.overall_finding}
                value={editedFinding}
                onChange={setEditedFinding}
                decision={decisions.overall_finding}
                onAccept={() => acceptField('overall_finding', draft.draft.overall_finding, editedFinding)}
                onDiscard={() => discardField('overall_finding')}
                rows={3}
              />

              {/* Risk Rationale */}
              <DraftField
                label="Risk Rationale"
                original={draft.draft.risk_rationale}
                value={editedRationale}
                onChange={setEditedRationale}
                decision={decisions.risk_rationale}
                onAccept={() => acceptField('risk_rationale', draft.draft.risk_rationale, editedRationale)}
                onDiscard={() => discardField('risk_rationale')}
                rows={5}
              />

              {/* Action Plan Rollup — render-only / clipboard-only */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Action Plan Rollup</p>
                    <p className="text-xs text-muted-foreground">Render-only synthesis. Copy to clipboard for use in remediation comms — does not modify your live action items.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={copyRollupToClipboard}>
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                </div>
                <p className="text-sm whitespace-pre-wrap">{draft.draft.action_plan_rollup.introduction}</p>
                {draft.draft.action_plan_rollup.priority_groups.map((g, i) => (
                  <div key={i} className="space-y-1">
                    <Badge variant={g.priority === 'critical' ? 'destructive' : g.priority === 'high' ? 'default' : 'secondary'} className="capitalize">
                      {g.priority}
                    </Badge>
                    <p className="text-sm whitespace-pre-wrap">{g.narrative}</p>
                    <ul className="text-sm list-disc pl-5 space-y-0.5">
                      {g.actions.map((a, j) => (
                        <li key={j}>
                          {a.summary}
                          {a.linked_finding_ids.length > 0 && (
                            <span className="text-xs text-muted-foreground"> · {a.linked_finding_ids.length} finding{a.linked_finding_ids.length === 1 ? '' : 's'}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <p className="text-sm whitespace-pre-wrap italic">{draft.draft.action_plan_rollup.closing}</p>
              </div>

              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                  Dismiss draft
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Report Preview */}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(audit.audit_type === 'due_diligence' || audit.audit_type === 'due_diligence_combined') ? (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Purchaser (commissioning client)</p>
                <p className="font-medium">{(audit as any).snapshot_purchaser_name || '—'}</p>
                <p className="text-[11px] text-muted-foreground italic">See header for live purchaser name.</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Target RTO</p>
                <p className="font-medium">{audit.snapshot_rto_name || '—'}</p>
                {audit.snapshot_rto_number && (
                  <p className="text-xs text-muted-foreground">RTO #{audit.snapshot_rto_number}{audit.snapshot_cricos_code ? ` · CRICOS ${audit.snapshot_cricos_code}` : ''}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Conducted</p>
                <p>{audit.conducted_at ? new Date(audit.conducted_at).toLocaleDateString('en-AU') : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Risk Rating</p>
                {audit.risk_rating ? <AuditRiskBadge risk={audit.risk_rating} /> : <p>—</p>}
              </div>
            </div>
          ) : (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Client</p>
              <p className="font-medium">{audit.snapshot_rto_name || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">RTO Number</p>
              <p>{audit.snapshot_rto_number || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Conducted</p>
              <p>{audit.conducted_at ? new Date(audit.conducted_at).toLocaleDateString('en-AU') : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Risk Rating</p>
              {audit.risk_rating ? <AuditRiskBadge risk={audit.risk_rating} /> : <p>—</p>}
            </div>
          </div>
          )}

          {audit.score_pct !== null && (
            <div>
              <p className="text-xs text-muted-foreground">Score</p>
              <p className="text-2xl font-bold">{audit.score_pct}%</p>
            </div>
          )}

          {audit.executive_summary && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Executive Summary</p>
              <p className="text-sm whitespace-pre-wrap">{audit.executive_summary}</p>
            </div>
          )}

          {audit.overall_finding && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Overall Finding</p>
              <p className="text-sm whitespace-pre-wrap">{audit.overall_finding}</p>
            </div>
          )}

          <div>
            <p className="text-xs text-muted-foreground mb-2">Findings by Priority</p>
            <div className="flex gap-3 text-sm">
              <span className="text-red-600">Critical: {findingsByPriority.critical}</span>
              <span className="text-orange-600">High: {findingsByPriority.high}</span>
              <span className="text-amber-600">Medium: {findingsByPriority.medium}</span>
              <span className="text-green-600">Low: {findingsByPriority.low}</span>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Open Actions</p>
            <p className={`text-sm font-medium ${openActions > 0 ? 'text-orange-600' : ''}`}>{openActions}</p>
          </div>
        </CardContent>
      </Card>

      {/* Release to Client */}
      <div className="border-t pt-6">
        {!isReleased ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="h-4 w-4" /> Release to Client
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                When you're ready, release the report to the client's portal. They will see the report and their action plan.
              </p>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Message to client (optional)</p>
                <Textarea
                  value={releaseNotes}
                  onChange={(e) => setReleaseNotes(e.target.value)}
                  rows={3}
                  maxLength={4000}
                  placeholder="Please review the attached Compliance Health Check report and action plan. Contact your consultant if you have any questions."
                />
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="w-full">
                    <Send className="h-4 w-4 mr-2" /> Release Report to Client
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Release this report to {audit.snapshot_rto_name || 'the client'}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      They will be able to view the report and their {openActions} action item{openActions !== 1 ? 's' : ''} in their portal. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => releaseReport.mutate({ releaseNotes: releaseNotes.trim() || undefined })}
                      disabled={releaseReport.isPending || !canReport}
                    >
                      Release Report
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <h3 className="font-semibold text-green-800">Released to client</h3>
              </div>

              {releasedAt && (
                <p className="text-sm text-green-700">
                  Released on {new Date(releasedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}

              <div className="text-sm">
                <span className="text-muted-foreground">Client acknowledgement: </span>
                {acknowledgedAt ? (
                  <span className="text-green-700 font-medium">
                    Acknowledged on {new Date(acknowledgedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                ) : (
                  <span className="text-amber-600">Awaiting acknowledgement</span>
                )}
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive border-destructive/30">
                    <X className="h-3 w-3 mr-1" /> Revoke access
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Revoke client access?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The client will no longer be able to view this report or action plan in their portal.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => revokeReport.mutate()} className="bg-destructive hover:bg-destructive/90">
                      Revoke Access
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        )}
      </div>

      <SendPreliminarySummaryDialog
        open={preliminaryOpen}
        onOpenChange={setPreliminaryOpen}
        audit={audit}
        findings={findings}
        actions={actions}
      />
    </div>
  );
}

// ─── DraftField — per-field accept/edit/discard control for AI drafts ──
interface DraftFieldProps {
  label: string;
  original: string;
  value: string;
  onChange: (v: string) => void;
  decision: 'accepted' | 'edited' | 'rejected' | undefined;
  onAccept: () => void;
  onDiscard: () => void;
  rows?: number;
}

function DraftField({
  label,
  original,
  value,
  onChange,
  decision,
  onAccept,
  onDiscard,
  rows = 5,
}: DraftFieldProps) {
  const isEdited = value !== original;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        {decision === 'accepted' && (
          <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Accepted
          </Badge>
        )}
        {decision === 'edited' && (
          <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-50">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Saved with edits
          </Badge>
        )}
        {decision === 'rejected' && (
          <Badge variant="outline" className="text-muted-foreground">
            <X className="h-3 w-3 mr-1" /> Discarded
          </Badge>
        )}
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        disabled={decision === 'accepted' || decision === 'edited' || decision === 'rejected'}
        className="text-sm"
      />
      {!decision && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onAccept}>
            {isEdited ? 'Save edits' : 'Accept'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDiscard}>
            Discard
          </Button>
        </div>
      )}
    </div>
  );
}
