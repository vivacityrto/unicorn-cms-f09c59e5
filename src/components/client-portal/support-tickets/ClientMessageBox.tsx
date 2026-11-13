import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { useClientTenant } from '@/contexts/ClientTenantContext';
import { AttachmentPicker } from '@/components/support-tickets/AttachmentParts';
import { collectDiagnostics } from '@/components/support-tickets/diagnostics';
import { ticketRef } from '@/components/support-tickets/ticketLogic';
import { createTicket, requestAiDraft, type CreatedTicket } from '@/components/support-tickets/useCreateTicket';
import { uploadTicketFile } from '@/components/support-tickets/useTicketThread';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_BODY = 10000;

/**
 * The one client way to raise a ticket: write a message, optionally add a
 * screenshot, send. The message becomes a ticket straight away (nothing waits
 * on AI) and an AI draft of the title, type and urgency follows for staff to check.
 */
export function ClientMessageBox({
  onViewTickets, className,
}: { onViewTickets?: () => void; className?: string }) {
  const { user, profile } = useAuth();
  const { activeTenantId } = useClientTenant();
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedTicket | null>(null);
  const inFlight = useRef(false);

  const canSend = body.trim().length > 0 && body.length <= MAX_BODY && !submitting;

  const send = async () => {
    if (!canSend || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const tenantId = activeTenantId ?? profile?.tenant_id ?? null;
      const result = await createTicket({
        subject: subject.trim(),
        body,
        pagePath: window.location.pathname,
        diagnostics: collectDiagnostics(),
        tenantId,
      });
      // The ticket exists now. Everything after this is best effort and must not hide that.
      if (user) {
        for (const f of files) {
          try {
            await uploadTicketFile({ ticketId: result.id, messageId: null, file: f, userId: user.id });
          } catch {
            toast.error(`Your message was sent, but ${f.name} could not be attached.`);
          }
        }
      }
      requestAiDraft(result.id);
      qc.invalidateQueries({ queryKey: ['client-support-tickets'] });
      setCreated(result);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Your message could not be sent.';
      setError(message);
      toast.error(message);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const another = () => {
    setSubject(''); setBody(''); setFiles([]); setError(null); setCreated(null);
  };

  if (created) {
    return (
      <div role="status" className={`flex flex-col items-center gap-3 py-8 text-center ${className ?? ''}`}>
        <CheckCircle2 aria-hidden className="h-12 w-12 text-emerald-500" />
        <div>
          <p className="font-semibold text-foreground">We have your message</p>
          <p className="mt-1 text-sm text-muted-foreground">Your reference is {ticketRef(created.ticketNumber)}. Our team will be in touch.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={another} className="text-foreground min-h-11 sm:min-h-9">Send another message</Button>
          <Button asChild className="min-h-11 sm:min-h-9">
            <Link to={`/client/support-tickets/${created.id}`} onClick={onViewTickets}>View this ticket</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className={`space-y-3 ${className ?? ''}`}
      onSubmit={(e) => { e.preventDefault(); void send(); }}
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="cmb-subject">Subject <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Input id="cmb-subject" value={subject} maxLength={300} onChange={(e) => setSubject(e.target.value)} disabled={submitting} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cmb-body">How can we help?</Label>
        <Textarea
          id="cmb-body"
          value={body}
          rows={5}
          maxLength={MAX_BODY}
          onChange={(e) => setBody(e.target.value)}
          disabled={submitting}
          placeholder="Tell us what you were trying to do and what happened."
          aria-describedby="cmb-note"
        />
      </div>
      <AttachmentPicker
        files={files}
        onChange={setFiles}
        disabled={submitting}
        maxFiles={1}
        maxBytes={MAX_IMAGE_BYTES}
        accept="image/*"
      />
      <p id="cmb-note" className="text-xs text-muted-foreground">Our team may use AI to sort your message; a person reviews it.</p>
      {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-foreground">{error} Your message is still here, so you can try again.</p>}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" aria-live="polite">{body.trim().length === 0 ? 'Write a message to send it.' : ''}</p>
        <Button type="submit" disabled={!canSend} className="min-h-11 gap-1.5 sm:min-h-9">
          {submitting ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <Send aria-hidden className="h-4 w-4" />}
          Send message
        </Button>
      </div>
    </form>
  );
}
