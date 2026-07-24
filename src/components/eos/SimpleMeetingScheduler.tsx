import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useEosConfigMeetingActions } from '@/hooks/useEosConfigMeetingActions';
import type { ConfigMeetingType } from '@/types/eos';

const MEETING_TYPE_OPTIONS: { value: ConfigMeetingType; label: string }[] = [
  { value: 'L10', label: 'Level 10' },
  { value: 'Quarterly', label: 'Quarterly' },
  { value: 'Annual', label: 'Annual' },
  { value: 'Same_Page', label: 'Same Page' },
];

interface SimpleMeetingSchedulerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduled?: () => void;
}

/**
 * Stage 2's "type + date only" scheduler for the four fixed meeting
 * types. Frequency, facilitator, and participants all derive from that
 * type's Configuration (create_meeting_from_configuration RPC, M8) —
 * nothing else to pick here, unlike the legacy MeetingScheduler this
 * replaces once eos_config_v2 is on.
 */
export function SimpleMeetingScheduler({ open, onOpenChange, onScheduled }: SimpleMeetingSchedulerProps) {
  const [meetingType, setMeetingType] = useState<ConfigMeetingType>('L10');
  const [scheduledDate, setScheduledDate] = useState('');
  const { createMeetingFromConfiguration } = useEosConfigMeetingActions();

  const handleSchedule = () => {
    if (!scheduledDate) return;
    createMeetingFromConfiguration.mutate(
      { meetingType, scheduledDate: new Date(scheduledDate) },
      {
        onSuccess: () => {
          setScheduledDate('');
          onOpenChange(false);
          onScheduled?.();
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Meeting</DialogTitle>
          <DialogDescription>
            Agenda, facilitator, and participants all derive from this type's Configuration.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Meeting Type</Label>
            <Select value={meetingType} onValueChange={(v) => setMeetingType(v as ConfigMeetingType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MEETING_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date &amp; Time</Label>
            <Input
              type="datetime-local"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createMeetingFromConfiguration.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSchedule} disabled={!scheduledDate || createMeetingFromConfiguration.isPending}>
            {createMeetingFromConfiguration.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Scheduling...
              </>
            ) : (
              'Schedule'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
