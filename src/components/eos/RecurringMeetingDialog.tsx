import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Repeat } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

interface RecurringMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string;
  meetingTitle: string;
}

export function RecurringMeetingDialog({ 
  open, 
  onOpenChange, 
  meetingId, 
  meetingTitle 
}: RecurringMeetingDialogProps) {
  const [weeksAhead, setWeeksAhead] = useState(12);
  const queryClient = useQueryClient();

  const createRecurring = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_recurring_meetings', {
        p_base_meeting_id: meetingId,
        p_weeks_ahead: weeksAhead,
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['eos-meetings'] });
      toast({ 
        title: 'Recurring meetings created', 
        description: `Created ${data.length} meetings for the next ${weeksAhead} weeks` 
      });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Error creating recurring meetings', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="h-5 w-5" />
            Create Recurring Meetings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Base Meeting</Label>
            <p className="text-sm font-medium">{meetingTitle}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="weeks">Number of Weeks</Label>
            <Input
              id="weeks"
              type="number"
              min={1}
              max={52}
              value={weeksAhead}
              onChange={(e) => setWeeksAhead(parseInt(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Will create {weeksAhead} weekly meetings with the same participants and agenda
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={() => createRecurring.mutate()}
            disabled={createRecurring.isPending}
          >
            Create Recurring Meetings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
