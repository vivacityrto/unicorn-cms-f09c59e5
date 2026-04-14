import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileText, Download, Clock, Send, CheckCircle2, AlertTriangle, Shield, X } from 'lucide-react';
import { AuditRiskBadge } from '@/components/audit/AuditRiskBadge';
import { useReleaseReport, useRevokeReport } from '@/hooks/useAuditReport';
import { useAuditActions } from '@/hooks/useAuditWorkspace';
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

interface ReportTabProps {
  audit: ClientAudit;
  findings: AuditFinding[];
  actions: AuditAction[];
}

export function ReportTab({ audit, findings, actions }: ReportTabProps) {
  const [releaseNotes, setReleaseNotes] = useState('');
  const releaseReport = useReleaseReport(audit.id);
  const revokeReport = useRevokeReport(audit.id);

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

  return (
    <div className="space-y-6">
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
              <Button size="sm" variant="outline">
                <Download className="h-3 w-3 mr-1" /> Download PDF
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" /> No report generated yet
            </div>
          )}
          <Button disabled>
            <FileText className="h-4 w-4 mr-2" />
            Generate Report
          </Button>
          <p className="text-xs text-muted-foreground">
            Report generation coming soon. The edge function for generating PDF reports will be built in a follow-up.
          </p>
        </CardContent>
      </Card>

      {/* Report Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Report Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
                  placeholder="Please review the attached Compliance Health Check report and action plan. Contact your consultant if you have any questions."
                />
              </div>

              <Alert className="bg-amber-50 border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800 text-sm">
                  This will make the report and all {openActions} action item{openActions !== 1 ? 's' : ''} visible to the client in their portal.
                </AlertDescription>
              </Alert>

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
                      disabled={releaseReport.isPending}
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
    </div>
  );
}
