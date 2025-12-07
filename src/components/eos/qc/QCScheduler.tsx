import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Calendar, Users } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useQuarterlyConversations } from '@/hooks/useQuarterlyConversations';
import { format, addMonths } from 'date-fns';

interface QCSchedulerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduled?: () => void;
}

export const QCScheduler = ({ open, onOpenChange, onScheduled }: QCSchedulerProps) => {
  const { profile } = useAuth();
  const { templates, scheduleQC } = useQuarterlyConversations();
  const [revieweeId, setRevieweeId] = useState('');
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [quarterStart, setQuarterStart] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-calculate quarter end (3 months from start)
  const quarterEnd = quarterStart 
    ? format(addMonths(new Date(quarterStart), 3), 'yyyy-MM-dd')
    : '';

  // Fetch users for selection
  const { data: users } = useQuery({
    queryKey: ['users', profile?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('user_uuid, first_name, last_name, email')
        .eq('tenant_id', profile?.tenant_id!)
        .eq('disabled', false);
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.tenant_id && open,
  });

  const defaultTemplate = templates?.find(t => t.is_default);

  const handleSchedule = async () => {
    if (!revieweeId || managerIds.length === 0 || !quarterStart || !scheduledDate || !defaultTemplate) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      await scheduleQC.mutateAsync({
        reviewee_id: revieweeId,
        manager_ids: managerIds,
        template_id: defaultTemplate.id,
        quarter_start: quarterStart,
        quarter_end: quarterEnd,
        scheduled_at: scheduledDate,
      });

      onScheduled?.();
      onOpenChange(false);
      
      // Reset form
      setRevieweeId('');
      setManagerIds([]);
      setQuarterStart('');
      setScheduledDate('');
    } catch (error: any) {
      toast({ title: 'Error scheduling QC', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Schedule Quarterly Conversation
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reviewee">Team Member (Reviewee) *</Label>
            <Select value={revieweeId} onValueChange={setRevieweeId}>
              <SelectTrigger id="reviewee">
                <SelectValue placeholder="Select team member" />
              </SelectTrigger>
              <SelectContent>
                {users?.map((user) => (
                  <SelectItem key={user.user_uuid} value={user.user_uuid}>
                    {user.first_name} {user.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="manager">Manager (Facilitator) *</Label>
            <Select 
              value={managerIds[0] || ''} 
              onValueChange={(value) => setManagerIds([value])}
            >
              <SelectTrigger id="manager">
                <SelectValue placeholder="Select manager" />
              </SelectTrigger>
              <SelectContent>
                {users?.map((user) => (
                  <SelectItem key={user.user_uuid} value={user.user_uuid}>
                    {user.first_name} {user.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quarter-start">Quarter Start *</Label>
              <Input
                id="quarter-start"
                type="date"
                value={quarterStart}
                onChange={(e) => setQuarterStart(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quarter-end">Quarter End</Label>
              <Input
                id="quarter-end"
                type="date"
                value={quarterEnd}
                disabled
                className="bg-muted"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scheduled">Scheduled Date & Time *</Label>
            <Input
              id="scheduled"
              type="datetime-local"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>

          {defaultTemplate && (
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium">Template: {defaultTemplate.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {defaultTemplate.sections?.length || 0} sections • EOS standard format
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSchedule} disabled={isSubmitting}>
            {isSubmitting ? 'Scheduling...' : 'Schedule QC'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
