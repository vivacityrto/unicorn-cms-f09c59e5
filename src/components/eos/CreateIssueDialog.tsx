import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RiskOpportunityForm, type RiskOpportunityFormData } from './RiskOpportunityForm';
import { useRisksOpportunities } from '@/hooks/useRisksOpportunities';

interface CreateIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId?: string;
  defaultTitle?: string;
  defaultDescription?: string;
  linkedRockId?: string;
}

export function CreateIssueDialog({
  open,
  onOpenChange,
  meetingId,
  defaultTitle = '',
  defaultDescription = '',
  linkedRockId,
}: CreateIssueDialogProps) {
  const { createItem } = useRisksOpportunities();

  const handleSubmit = async (formData: RiskOpportunityFormData) => {
    await createItem.mutateAsync({
      item_type: formData.item_type,
      title: formData.title,
      description: formData.description,
      category: formData.category || undefined,
      impact: formData.impact || undefined,
      quarter_number: formData.quarter_number,
      quarter_year: formData.quarter_year,
      linked_rock_id: formData.linked_rock_id || undefined,
      meeting_id: meetingId,
    });
    
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Risk or Opportunity</DialogTitle>
        </DialogHeader>
        <RiskOpportunityForm
          initialValues={{
            item_type: 'risk',
            title: defaultTitle,
            description: defaultDescription,
            linked_rock_id: linkedRockId,
            meeting_id: meetingId,
          }}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          isSubmitting={createItem.isPending}
          // In IDS context, default to risk but allow changing to opportunity
          hideTypeSelector={false}
          submitLabel="Create"
        />
      </DialogContent>
    </Dialog>
  );
}
