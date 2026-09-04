import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

interface AuditSummary {
  id: string;
  title?: string | null;
  audit_type?: string | null;
  status?: string | null;
  client_name?: string | null;
  created_at?: string | null;
}

interface DeleteAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audit: AuditSummary;
  /** Called after a successful deletion (e.g. to navigate away). */
  onDeleted?: () => void;
}

const MIN_LEN = 10;
const MAX_LEN = 1000;

export function DeleteAuditDialog({
  open,
  onOpenChange,
  audit,
  onDeleted,
}: DeleteAuditDialogProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [step, setStep] = useState<'reason' | 'confirm'>('reason');
  const queryClient = useQueryClient();

  // Reset state whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setReason('');
      setInlineError(null);
      setSubmitting(false);
      setStep('reason');
    }
  }, [open]);

  const trimmed = reason.trim();
  const valid = trimmed.length >= MIN_LEN && trimmed.length <= MAX_LEN;

  const handleDelete = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setInlineError(null);

    try {
      const { data, error } = await supabase.functions.invoke<{ error?: string }>(
        'delete-incomplete-audit',
        { body: { audit_id: audit.id, reason: trimmed } },
      );

      const serverError = data?.error;

      if (error || serverError) {
        const msg =
          serverError ?? error?.message ?? 'Could not delete audit.';

        // 403 means the audit is no longer deletable (closed/report generated
        // by someone else). Close the dialog and refresh so UI reflects it.
        const looksLockedOut = /cannot be deleted/i.test(msg);
        if (looksLockedOut) {
          toast.error(msg);
          queryClient.invalidateQueries({ queryKey: ['client_audits'] });
          queryClient.invalidateQueries({ queryKey: ['audit', audit.id] });
          onOpenChange(false);
          return;
        }

        // Network / other failures: keep dialog open with inline error so the
        // user can retry without re-typing the reason.
        setInlineError(msg);
        return;
      }

      toast.success('Audit deleted.');
      queryClient.invalidateQueries({ queryKey: ['client_audits'] });
      queryClient.invalidateQueries({ queryKey: ['audits-dashboard'] });
      onOpenChange(false);
      onDeleted?.();
    } catch (err) {
      setInlineError(
        err instanceof Error ? err.message : 'Unexpected error.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const SummaryBlock = (
    <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
      <div>
        <span className="text-muted-foreground">Title: </span>
        <span className="font-medium">{audit.title || 'Untitled'}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {audit.audit_type && (
          <span>
            <span className="text-muted-foreground">Type: </span>
            {audit.audit_type}
          </span>
        )}
        {audit.client_name && (
          <span>
            <span className="text-muted-foreground">Client: </span>
            {audit.client_name}
          </span>
        )}
        {audit.status && (
          <span>
            <span className="text-muted-foreground">Status: </span>
            <span className="font-medium uppercase tracking-wide">
              {audit.status.replace('_', ' ')}
            </span>
          </span>
        )}
        {audit.created_at && (
          <span>
            <span className="text-muted-foreground">Created: </span>
            {format(new Date(audit.created_at), 'd MMM yyyy')}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        {step === 'reason' ? (
          <>
            <DialogHeader>
              <DialogTitle>Delete this audit?</DialogTitle>
              <DialogDescription>
                This will permanently remove the audit and all linked sections,
                responses, findings, documents, and scheduled appointments. This
                cannot be undone. Audits that are closed or have a generated
                report cannot be deleted.
              </DialogDescription>
            </DialogHeader>

            {SummaryBlock}

            <div className="space-y-1.5">
              <Label htmlFor="delete-audit-reason">
                Reason for deletion <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="delete-audit-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, MAX_LEN))}
                placeholder="e.g. Duplicate of audit XYZ created in error"
                rows={4}
                autoFocus
              />
              <div className="flex items-center justify-between text-xs">
                <span
                  className={
                    trimmed.length > 0 && trimmed.length < MIN_LEN
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                  }
                >
                  {trimmed.length < MIN_LEN
                    ? `Please enter at least ${MIN_LEN} characters.`
                    : 'Looks good.'}
                </span>
                <span className="text-muted-foreground">
                  {reason.length}/{MAX_LEN}
                </span>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => setStep('confirm')}
                disabled={!valid}
              >
                Continue
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Confirm permanent deletion</DialogTitle>
              <DialogDescription>
                Please review the details below. Once you confirm, the audit
                and all linked records will be permanently removed. This action
                cannot be undone.
              </DialogDescription>
            </DialogHeader>

            {SummaryBlock}

            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-destructive">
                Reason that will be recorded in the audit log
              </div>
              <p className="whitespace-pre-wrap text-foreground">{trimmed}</p>
            </div>

            {inlineError && (
              <p className="text-sm text-destructive" role="alert">
                {inlineError}
              </p>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setInlineError(null);
                  setStep('reason');
                }}
                disabled={submitting}
              >
                Back
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={!valid || submitting}
              >
                {submitting && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {submitting ? 'Deleting…' : 'Confirm permanent deletion'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function canDeleteAudit(a: {
  status?: string | null;
  closed_at?: string | null;
  report_generated_at?: string | null;
}) {
  return (
    (a.status === 'draft' || a.status === 'in_progress') &&
    a.closed_at == null &&
    a.report_generated_at == null
  );
}
