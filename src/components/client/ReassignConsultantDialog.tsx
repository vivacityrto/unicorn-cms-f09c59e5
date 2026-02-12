import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConsultantAssignment } from '@/hooks/useConsultantAssignment';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ArrowRightLeft, Loader2 } from 'lucide-react';

interface ReassignConsultantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  currentConsultantName?: string;
}

export function ReassignConsultantDialog({
  open,
  onOpenChange,
  tenantId,
  currentConsultantName,
}: ReassignConsultantDialogProps) {
  const [selectedConsultant, setSelectedConsultant] = useState('');
  const [reason, setReason] = useState('');
  const { manualOverride, isOverriding } = useConsultantAssignment(tenantId);

  // Fetch eligible consultants
  const { data: consultants = [] } = useQuery({
    queryKey: ['eligible-consultants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name, email, job_title, allocation_paused')
        .eq('is_vivacity_internal', true)
        .eq('disabled', false)
        .eq('archived', false)
        .order('first_name');

      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const handleSubmit = async () => {
    if (!selectedConsultant || !reason.trim()) return;

    await manualOverride(selectedConsultant, reason.trim());
    setSelectedConsultant('');
    setReason('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Reassign Consultant
          </DialogTitle>
          <DialogDescription>
            {currentConsultantName
              ? `Currently assigned to ${currentConsultantName}. Select a new consultant and provide a reason.`
              : 'Select a consultant and provide a reason for the manual assignment.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="consultant">New Consultant *</Label>
            <Select value={selectedConsultant} onValueChange={setSelectedConsultant}>
              <SelectTrigger>
                <SelectValue placeholder="Select consultant..." />
              </SelectTrigger>
              <SelectContent>
                {consultants
                  .filter((c: any) => !c.allocation_paused)
                  .map((c: any) => (
                    <SelectItem key={c.user_uuid} value={c.user_uuid}>
                      {c.first_name} {c.last_name}
                      {c.job_title ? ` — ${c.job_title}` : ''}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason for Override *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this manual reassignment is needed..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              This reason will be recorded in the audit log.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isOverriding}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isOverriding || !selectedConsultant || !reason.trim()}
          >
            {isOverriding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Reassigning...
              </>
            ) : (
              'Confirm Reassignment'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
