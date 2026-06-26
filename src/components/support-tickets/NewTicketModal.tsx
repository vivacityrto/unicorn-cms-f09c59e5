import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { TicketTypePicker } from './TicketTypePicker';
import { TICKET_TYPE_BY_KEY, TicketTypeKey } from './ticketTypeConfig';
import { useSubmitSupportTicket } from './useSubmitSupportTicket';
import { BrokenTicketForm } from './forms/BrokenTicketForm';
import { FeatureRequestForm } from './forms/FeatureRequestForm';
import { UxImprovementForm } from './forms/UxImprovementForm';
import { QuestionTicketForm } from './forms/QuestionTicketForm';
import { OtherTicketForm } from './forms/OtherTicketForm';

interface FormHandle {
  submit: () => Promise<any | null>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewTicketModal({ open, onOpenChange }: Props) {
  const { profile } = useAuth();
  const { submit, isLoading, hasTenant } = useSubmitSupportTicket();
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
    if (!values) {
      setSubmitting(false);
      return;
    }
    const ok = await submit(selectedType, values);
    setSubmitting(false);
    if (ok) {
      reset();
      onOpenChange(false);
    }
  };

  const userName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'You';
  const company = profile?.unicorn_role && (profile.unicorn_role === 'Super Admin' || profile.unicorn_role === 'Team Leader' || profile.unicorn_role === 'Team Member')
    ? 'Vivacity'
    : 'Your Organisation';

  const FormComponent = (() => {
    switch (selectedType) {
      case 'broken': return BrokenTicketForm;
      case 'feature': return FeatureRequestForm;
      case 'improvement': return UxImprovementForm;
      case 'question': return QuestionTicketForm;
      case 'other': return OtherTicketForm;
      default: return null;
    }
  })();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit Support Ticket</DialogTitle>
          <DialogDescription>
            {step === 'pick'
              ? 'Select what best describes your submission.'
              : selectedType && `${TICKET_TYPE_BY_KEY[selectedType].emoji} ${TICKET_TYPE_BY_KEY[selectedType].label}`}
          </DialogDescription>
          <div className="text-xs text-muted-foreground flex items-center gap-2 pt-1">
            <span>{company}</span>
            <span>•</span>
            <span>From: {userName}</span>
            {profile?.unicorn_role && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">{profile.unicorn_role}</Badge>
            )}
          </div>
        </DialogHeader>

        <div className="py-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : step === 'pick' ? (
            <TicketTypePicker selected={selectedType} onSelect={handlePick} />
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
              <Button type="button" onClick={handleSubmit} disabled={submitting || isLoading || !hasTenant}>
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
