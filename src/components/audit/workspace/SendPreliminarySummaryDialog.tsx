import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useOutlookConnectionStatus } from '@/hooks/useOutlookConnectionStatus';
import { useAuditAppointments } from '@/hooks/useAuditSchedule';
import { supabase } from '@/integrations/supabase/client';
import { Send, Loader2, AlertTriangle, Lock, Info } from 'lucide-react';
import {
  buildPreliminarySummaryHtml,
  buildPreliminarySummarySubject,
  PRELIMINARY_DISCLAIMER_HTML,
} from '@/lib/buildPreliminaryAuditSummary';
import type { ClientAudit } from '@/types/clientAudits';
import type { AuditFinding, AuditAction } from '@/types/auditWorkspace';

interface SendPreliminarySummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audit: ClientAudit;
  findings: AuditFinding[];
  actions: AuditAction[];
}

export function SendPreliminarySummaryDialog({
  open,
  onOpenChange,
  audit,
  findings,
  actions,
}: SendPreliminarySummaryDialogProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const { isConnected: hasM365Connection, connectionStatus } = useOutlookConnectionStatus();
  const { openingMeeting, closingMeeting } = useAuditAppointments(audit.id);

  const [primaryContactEmail, setPrimaryContactEmail] = useState('');
  const [clientName, setClientName] = useState<string | null>(null);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [completion, setCompletion] = useState<{ answered: number; total: number } | null>(null);

  const creatorEmail = profile?.email || '';
  const tenantId = audit.subject_tenant_id;

  // Fetch primary contact email + display name for the client
  useEffect(() => {
    if (!open || !tenantId) return;
    (async () => {
      const [{ data: tenant }, { data: tu }] = await Promise.all([
        supabase.from('tenants').select('name').eq('id', tenantId).maybeSingle(),
        supabase
          .from('tenant_users')
          .select('user_id')
          .eq('tenant_id', tenantId)
          .eq('primary_contact', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      if (tenant?.name) setClientName(tenant.name);
      if (tu?.user_id) {
        const { data: u } = await supabase
          .from('users')
          .select('email')
          .eq('user_uuid', tu.user_id)
          .maybeSingle();
        if (u?.email) setPrimaryContactEmail(u.email);
      }
    })();
  }, [open, tenantId]);

  // Fetch audit completion (answered / total questions) when dialog opens
  useEffect(() => {
    if (!open || !audit.id) return;
    (async () => {
      const { data: sections } = await supabase
        .from('client_audit_sections' as any)
        .select('template_section_id')
        .eq('audit_id', audit.id);
      const templateSectionIds = ((sections || []) as any[])
        .map(s => s.template_section_id)
        .filter(Boolean);

      if (templateSectionIds.length === 0) {
        setCompletion(null);
        return;
      }

      const [{ data: questions }, { data: responses }] = await Promise.all([
        supabase
          .from('compliance_template_questions' as any)
          .select('id')
          .in('section_id', templateSectionIds)
          .eq('is_active', true),
        supabase
          .from('client_audit_responses' as any)
          .select('question_id, rating')
          .eq('audit_id', audit.id)
          .not('rating', 'is', null),
      ]);

      const total = (questions || []).length;
      const questionIds = new Set(((questions || []) as any[]).map(q => q.id));
      const answered = ((responses || []) as any[]).filter(
        r => r.question_id && questionIds.has(r.question_id),
      ).length;
      setCompletion({ answered, total });
    })();
  }, [open, audit.id]);

  // Compose subject + body when dialog opens or data changes
  useEffect(() => {
    if (!open) return;
    setSubject(buildPreliminarySummarySubject(audit, clientName));
    setBody(
      buildPreliminarySummaryHtml({
        audit,
        findings,
        actions,
        clientName,
        openingMeetingStatus: openingMeeting?.status,
        closingMeetingStatus: closingMeeting?.status,
        completion,
      }),
    );
    setTo(primaryContactEmail || '');
  }, [open, audit, findings, actions, clientName, primaryContactEmail, openingMeeting?.status, closingMeeting?.status, completion]);

  const recipientCount = useMemo(() => {
    return to
      .split(/[,;]/)
      .map(s => s.trim())
      .filter(Boolean).length;
  }, [to]);

  const disclaimerStripped = !body.includes('PRELIMINARY SUMMARY');

  const sendEmail = async () => {
    if (!to.trim()) {
      toast({ title: 'Missing recipient', description: 'Add at least one recipient.', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const functionName = hasM365Connection ? 'send-email-graph' : 'send-composed-email';
      const res = await fetch(
        `https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/${functionName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.session?.access_token}`,
          },
          body: JSON.stringify({
            tenant_id: tenantId,
            to,
            cc: creatorEmail || undefined,
            subject,
            body_html: body,
            dry_run: false,
          }),
        },
      );
      const result = await res.json();
      if (result.success) {
        toast({
          title: 'Preliminary summary sent',
          description: `Sent to ${recipientCount} recipient${recipientCount === 1 ? '' : 's'}. You were CC'd.`,
        });
        onOpenChange(false);
      } else {
        toast({
          title: 'Send failed',
          description: result.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  };

  const restoreDisclaimer = () => {
    setBody(PRELIMINARY_DISCLAIMER_HTML + '\n' + body);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[90vw] w-full max-h-[95vh] flex flex-col" size="full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Send Preliminary Summary
              <Badge variant="outline" className="text-xs font-normal">Information only</Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-auto space-y-3 mt-1">
            <Alert className="border-warning/30 bg-warning/10">
              <Info className="h-4 w-4 text-warning-foreground" />
              <AlertTitle>Preliminary — not the final report</AlertTitle>
              <AlertDescription className="text-xs">
                Nothing is saved to the audit record. The summary lives only in recipients' inboxes. You will be CC'd for your own records.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-[80px_1fr] items-center gap-2">
              <Label className="text-right text-sm font-semibold">To:</Label>
              <Input
                value={to}
                onChange={e => setTo(e.target.value)}
                placeholder="recipient@example.com, interested.party@example.com"
              />
            </div>
            <div className="grid grid-cols-[80px_1fr] items-center gap-2">
              <Label className="text-right text-sm font-semibold">CC:</Label>
              <div className="relative">
                <Input value={creatorEmail} readOnly disabled className="pr-9 cursor-not-allowed" />
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <div className="grid grid-cols-[80px_1fr] items-center gap-2">
              <Label className="text-right text-sm font-semibold">Subject:</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} />
            </div>

            <div>
              <Label className="text-sm font-semibold mb-1 block">Body:</Label>
              <RichTextEditor value={body} onChange={setBody} />
            </div>

            {disclaimerStripped && (
              <Alert variant="destructive" className="bg-destructive/5">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Disclaimer removed</AlertTitle>
                <AlertDescription className="flex items-center justify-between gap-3">
                  <span className="text-xs">
                    The "PRELIMINARY SUMMARY — subject to change" notice should remain so recipients understand this is a draft.
                  </span>
                  <Button size="sm" variant="outline" onClick={restoreDisclaimer}>
                    Restore disclaimer
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter className="flex items-center gap-2 pt-3 border-t">
            <div className="flex-1 text-xs text-muted-foreground">
              {hasM365Connection
                ? `Sending as ${connectionStatus?.account_email || creatorEmail || 'you'} via M365`
                : 'Sending via system relay'}
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
              Cancel
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={sending || !to.trim() || !subject.trim()}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
              Send Preliminary Summary
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        variant="warning"
        title="Send PRELIMINARY summary?"
        description={`This will email ${recipientCount} recipient${recipientCount === 1 ? '' : 's'}. You will be CC'd. Recipients will be told this is a draft and may change before the final report is issued.`}
        confirmText="Send now"
        cancelText="Back"
        isLoading={sending}
        onConfirm={sendEmail}
      />
    </>
  );
}
