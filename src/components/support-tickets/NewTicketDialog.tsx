import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AttachmentPicker } from './AttachmentParts';
import { collectDiagnostics } from './diagnostics';
import {
  PRODUCT_LABEL, TICKET_PRODUCTS, TICKET_TYPES, TICKET_URGENCIES, TYPE_LABEL, URGENCY_LABEL, ticketRef,
  type TicketProduct, type TicketType, type TicketUrgency,
} from './ticketLogic';
import { createTicket, type CreatedTicket } from './useCreateTicket';
import { uploadTicketFile } from './useTicketThread';

const MAX_BODY = 10000;

/** Staff raise a ticket by hand: full control of product, type, urgency and, if needed, the client. No AI step. */
export function NewTicketDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState<TicketType>('other');
  const [urgency, setUrgency] = useState<TicketUrgency>('medium');
  const [product, setProduct] = useState<TicketProduct>('unicorn');
  const [externalRef, setExternalRef] = useState('');
  const [onBehalf, setOnBehalf] = useState(false);
  const [tenantId, setTenantId] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedTicket | null>(null);

  const reset = () => {
    setSubject(''); setBody(''); setType('other'); setUrgency('medium'); setProduct('unicorn');
    setExternalRef(''); setOnBehalf(false); setTenantId(''); setFiles([]); setTouched(false);
    setSubmitting(false); setError(null); setCreated(null);
  };
  useEffect(() => { if (!open) reset(); }, [open]);

  const showClientPicker = product === 'unicorn' && onBehalf;
  const { data: tenants = [] } = useQuery({
    queryKey: ['support-ticket-tenant-options'],
    enabled: open && showClientPicker,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error: err } = await supabase.from('tenants').select('id, name').order('name').range(0, 9999);
      if (err) throw err;
      return (data ?? []) as { id: number; name: string }[];
    },
  });

  const trimmed = body.trim();
  const bodyError = trimmed.length === 0 ? 'Write a message so the team knows what is needed.' : body.length > MAX_BODY ? `Keep it under ${MAX_BODY.toLocaleString('en-AU')} characters.` : null;
  const clientError = showClientPicker && !tenantId ? 'Choose the client this ticket is for.' : null;
  const disabledReason = bodyError ?? clientError;

  const submit = async () => {
    setTouched(true);
    if (disabledReason || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createTicket({
        subject,
        body,
        pagePath: window.location.pathname,
        diagnostics: collectDiagnostics(),
        product,
        tenantId: showClientPicker ? Number(tenantId) : undefined,
        type,
        urgency,
        externalRef: product !== 'unicorn' ? externalRef.trim() : undefined,
      });
      if (user) {
        for (const f of files) {
          try {
            await uploadTicketFile({ ticketId: result.id, messageId: null, file: f, userId: user.id });
          } catch {
            toast.error(`The ticket was created, but ${f.name} could not be attached.`);
          }
        }
      }
      qc.invalidateQueries({ queryKey: ['support-tickets'] });
      setCreated(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The ticket could not be created. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="flex max-h-[90vh] max-w-xl flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>{created ? 'Ticket created' : 'New ticket'}</DialogTitle>
          <DialogDescription>
            {created ? 'It is now in the triage list.' : 'Raise an issue, request or question for the team.'}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center" role="status">
            <CheckCircle2 aria-hidden className="h-12 w-12 text-emerald-500" />
            <p className="text-lg font-semibold text-foreground">{ticketRef(created.ticketNumber)} is created</p>
            <p className="max-w-sm text-sm text-muted-foreground">Use this reference when you talk about the ticket. You can reply, assign it and change its status from the ticket panel.</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={reset} className="text-foreground min-h-11 sm:min-h-9">Submit another</Button>
              <Button onClick={() => { onOpenChange(false); navigate(`/support-tickets?ticket=${created.id}`); }} className="min-h-11 sm:min-h-9">View ticket</Button>
            </div>
          </div>
        ) : (
          <>
            <form
              id="new-ticket-form"
              className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4"
              onSubmit={(e) => { e.preventDefault(); void submit(); }}
              noValidate
            >
              <div className="space-y-1.5">
                <Label htmlFor="nt-subject">Subject <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="nt-subject" value={subject} maxLength={300} onChange={(e) => setSubject(e.target.value)} disabled={submitting} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="nt-body">Message</Label>
                <Textarea
                  id="nt-body"
                  value={body}
                  rows={6}
                  onChange={(e) => setBody(e.target.value)}
                  onBlur={() => setTouched(true)}
                  disabled={submitting}
                  aria-invalid={touched && !!bodyError}
                  aria-describedby={touched && bodyError ? 'nt-body-error' : undefined}
                  required
                />
                {touched && bodyError && <p id="nt-body-error" role="alert" className="text-sm text-destructive">{bodyError}</p>}
              </div>

              <fieldset className="space-y-2" disabled={submitting}>
                <legend className="mb-1 text-sm font-medium text-foreground">Product</legend>
                <RadioGroup value={product} onValueChange={(v) => setProduct(v as TicketProduct)} className="flex flex-wrap gap-4">
                  {TICKET_PRODUCTS.map((p) => (
                    <div key={p} className="flex min-h-11 items-center gap-2 sm:min-h-0">
                      <RadioGroupItem id={`nt-product-${p}`} value={p} />
                      <Label htmlFor={`nt-product-${p}`} className="font-normal">{PRODUCT_LABEL[p]}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </fieldset>

              {product !== 'unicorn' && (
                <div className="space-y-1.5 rounded-lg border border-border bg-muted/50 p-3">
                  <p className="text-sm text-foreground">Link to the record; do not paste customer or tenant details.</p>
                  <Label htmlFor="nt-ref">Link or reference <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input id="nt-ref" value={externalRef} maxLength={200} onChange={(e) => setExternalRef(e.target.value)} placeholder="For example the ComplyHub-side issue link" disabled={submitting} />
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="nt-type">Type</Label>
                  <Select value={type} onValueChange={(v) => setType(v as TicketType)} disabled={submitting}>
                    <SelectTrigger id="nt-type" className="min-h-11 sm:min-h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>{TICKET_TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nt-urgency">Urgency</Label>
                  <Select value={urgency} onValueChange={(v) => setUrgency(v as TicketUrgency)} disabled={submitting}>
                    <SelectTrigger id="nt-urgency" className="min-h-11 sm:min-h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>{TICKET_URGENCIES.map((u) => <SelectItem key={u} value={u}>{URGENCY_LABEL[u]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              {product === 'unicorn' && (
                <div className="space-y-2">
                  <div className="flex min-h-11 items-center gap-2 sm:min-h-0">
                    <Checkbox id="nt-onbehalf" checked={onBehalf} onCheckedChange={(c) => setOnBehalf(c === true)} disabled={submitting} />
                    <Label htmlFor="nt-onbehalf" className="font-normal">Raise on behalf of a client</Label>
                  </div>
                  {onBehalf && (
                    <div className="space-y-1.5">
                      <Label htmlFor="nt-client">Client</Label>
                      <Select value={tenantId} onValueChange={setTenantId} disabled={submitting}>
                        <SelectTrigger id="nt-client" className="min-h-11 sm:min-h-10" aria-invalid={touched && !!clientError}><SelectValue placeholder="Choose a client" /></SelectTrigger>
                        <SelectContent>{tenants.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                      </Select>
                      {touched && clientError && <p role="alert" className="text-sm text-destructive">{clientError}</p>}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <p className="text-sm font-medium text-foreground">Screenshot or file <span className="font-normal text-muted-foreground">(optional)</span></p>
                <AttachmentPicker files={files} onChange={setFiles} disabled={submitting} />
              </div>

              {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-foreground">{error}</p>}
            </form>

            <div className="flex flex-col gap-2 border-t border-border bg-background px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {disabledReason ?? 'Ready to submit.'}
              </p>
              <div className="flex gap-2 sm:justify-end">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting} className="text-foreground min-h-11 flex-1 sm:min-h-9 sm:flex-none">Cancel</Button>
                <Button type="submit" form="new-ticket-form" disabled={submitting || !!disabledReason} className="min-h-11 flex-1 gap-1.5 sm:min-h-9 sm:flex-none">
                  {submitting && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
                  Create ticket
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
