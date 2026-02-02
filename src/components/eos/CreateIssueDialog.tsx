import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RiskOpportunityForm, type RiskOpportunityFormData, type FormContext } from './RiskOpportunityForm';
import { useRisksOpportunities } from '@/hooks/useRisksOpportunities';

interface CreateIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId?: string;
  meetingSegmentId?: string;
  defaultTitle?: string;
  defaultDescription?: string;
  linkedRockId?: string;
  /** Context determines form behavior: 'ro_page' for Risks & Opportunities page, 'meeting_ids' for IDS in meetings */
  context?: FormContext;
  /** Meeting type for source tracking (L10, Quarterly, Annual) */
  meetingType?: string;
}

export function CreateIssueDialog({
  open,
  onOpenChange,
  meetingId,
  meetingSegmentId,
  defaultTitle = '',
  defaultDescription = '',
  linkedRockId,
  context = meetingId ? 'meeting_ids' : 'ro_page',
  meetingType,
}: CreateIssueDialogProps) {
  const { createItem } = useRisksOpportunities();

  // Determine source based on meeting type
  const getSource = () => {
    if (context !== 'meeting_ids') return 'ro_page';
    if (!meetingType) return 'meeting_ids';
    const type = meetingType.toLowerCase();
    if (type === 'l10' || type === 'level 10') return 'meeting_l10';
    if (type === 'quarterly') return 'meeting_quarterly';
    if (type === 'annual') return 'meeting_annual';
    return 'meeting_ids';
  };

  const handleSubmit = async (formData: RiskOpportunityFormData) => {
    await createItem.mutateAsync({
      item_type: formData.item_type,
      title: formData.title,
      description: formData.description,
      why_it_matters: formData.why_it_matters,
      category: formData.category || undefined,
      impact: formData.impact || undefined,
      quarter_number: formData.quarter_number,
      quarter_year: formData.quarter_year,
      linked_rock_id: formData.linked_rock_id || undefined,
      meeting_id: meetingId,
      meeting_segment_id: meetingSegmentId,
      source: getSource(),
    });
    
    onOpenChange(false);
  };

  const dialogTitle = context === 'meeting_ids' 
    ? 'Add Issue to IDS Queue' 
    : 'Add Risk or Opportunity';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>
        <RiskOpportunityForm
          initialValues={{
            item_type: 'risk',
            title: defaultTitle,
            description: defaultDescription,
            linked_rock_id: linkedRockId,
            meeting_id: meetingId,
            meeting_segment_id: meetingSegmentId,
            source: getSource(),
          }}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={createItem.isPending}
          context={context}
          submitLabel="Create"
        />
      </DialogContent>
    </Dialog>
  );
}
