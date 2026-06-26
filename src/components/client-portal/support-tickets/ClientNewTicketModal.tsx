import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useClientTenant } from '@/contexts/ClientTenantContext';
import { TICKET_TYPE_BY_KEY, TicketTypeKey } from '@/components/support-tickets/ticketTypeConfig';
import { ClientTicketTypePickerStep } from './ClientTicketTypePickerStep';
import { useClientSubmitTicket } from './useClientSubmitTicket';
import { ClientBrokenForm } from './forms/ClientBrokenForm';
import { ClientFeatureForm } from './forms/ClientFeatureForm';
import { ClientImprovementForm } from './forms/ClientImprovementForm';
import { ClientQuestionForm } from './forms/ClientQuestionForm';
import { ClientOtherForm } from './forms/ClientOtherForm';

interface FormHandle { submit: () => Promise<any | null>; }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClientNewTicketModal({ open, onOpenChange }: Props) {
  const { profile } = useAuth();
  const { tenantName } = useClientTenant();
  const { submit, isLoading, hasTenant } = useClientSubmitTicket();
  const [step, setStep] = useState<'pick' | 'form'>('pick');
  const [selectedType, setSelectedType] = useState<TicketTypeKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<FormHandle | null>(null);

  const reset = () => {
    setStep('pick');
    setSelectedType(null);
    setSubmitting(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handlePick = (key: TicketTypeKey) => {
    setSelectedType(key);
    setStep('form');
  };

  const handleSubmit = async () => {
    if (!selectedType || !formRef.current) return;
    setSubmitting(true);
    const values = await formRef.current.submit();
    if (!values) { setSubmitting(false); return; }
    const ok = await submit(selectedType, values);
    setSubmitting(false);
    if (ok) { reset(); onOpenChange(false); }
  };

  const userName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'You';

  const FormComponent = (() => {
    switch (selectedType) {
      case 'broken': return ClientBrokenForm;
      case 'feature': return ClientFeatureForm;
      case 'improvement': return ClientImprovementForm;
      case 'question': return ClientQuestionForm;
      case 'other': return ClientOtherForm;
      default: return null;
    }
  })();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Support Ticket</DialogTitle>
          <DialogDescription>
            {step === 'pick'
              ? 'Select what best describes your request.'
              : selectedType && `${TICKET_TYPE_BY_KEY[selectedType].emoji} ${TICKET_TYPE_BY_KEY[selectedType].label}`}
          </DialogDescription>
          <div className="text-xs text-muted-foreground pt-1">
            Company: <span className="font-medium">{tenantName ?? '—'}</span>
            <span className="mx-2">·</span>
            From: <span className="font-medium">{userName}</span>
          </div>
        </DialogHeader>

        <div className="py-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : step === 'pick' ? (
            <ClientTicketTypePickerStep selected={selectedType} onSelect={handlePick} />
          ) : FormComponent ? (
            <FormComponent ref={formRef as any} />
          ) : null}
        </div>

        {step === 'form' && (
          <DialogFooter className="flex sm:justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setStep('pick'); setSelectedType(null); }}
              disabled={submitting}
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || isLoading || !hasTenant}
                className="bg-[#7130A0] hover:bg-[#5e2787] text-white"
              >
                {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Submit Ticket
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
