import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Calendar, Repeat } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { MeetingTypeSelector } from './MeetingTypeSelector';
import { useEosMeetingRecurrences } from '@/hooks/useEosMeetingRecurrences';
import type { MeetingType } from '@/types/eos';

interface MeetingSchedulerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduled?: () => void;
}

export const MeetingScheduler = ({ open, onOpenChange, onScheduled }: MeetingSchedulerProps) => {
  const { profile } = useAuth();
  const { generateRecurrence } = useEosMeetingRecurrences();
  const [meetingType, setMeetingType] = useState<MeetingType>('L10');
  const [title, setTitle] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [duration, setDuration] = useState('90');
  const [templateId, setTemplateId] = useState('');
  const [facilitatorId, setFacilitatorId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [frequency, setFrequency] = useState<'one-time' | 'weekly' | 'quarterly' | 'annual'>('one-time');
  const [endRule, setEndRule] = useState<'date' | 'never'>('never');
  const [endDate, setEndDate] = useState('');

  // Fetch default template for selected meeting type
  const { data: defaultTemplate } = useQuery({
    queryKey: ['eos-agenda-templates', profile?.tenant_id, meetingType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_agenda_templates')
        .select('*')
        .eq('tenant_id', profile?.tenant_id!)
        .eq('meeting_type', meetingType)
        .eq('is_default', true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.tenant_id && open && !!meetingType,
  });

  // Auto-select the default template when it loads
  useEffect(() => {
    if (defaultTemplate) {
      setTemplateId(defaultTemplate.id);
    }
  }, [defaultTemplate]);

  // Fetch users for facilitator selection
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

  const handleSchedule = async () => {
    if (!title || !scheduledDate || !facilitatorId || !profile?.tenant_id) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }

    if (!templateId) {
      toast({ title: 'Template not loaded', description: 'Please wait for the template to load', variant: 'destructive' });
      return;
    }

    if (endRule === 'date' && !endDate) {
      toast({ title: 'Please specify an end date', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      // Create the base meeting
      const { data: meetingId, error: meetingError } = await supabase.rpc('create_meeting_from_template', {
        p_tenant_id: profile.tenant_id,
        p_agenda_template_id: templateId,
        p_title: title,
        p_scheduled_date: scheduledDate,
        p_duration_minutes: parseInt(duration),
        p_facilitator_id: facilitatorId,
        p_scribe_id: null,
        p_participant_ids: [],
      });

      if (meetingError) throw meetingError;

      // If recurring, generate recurrence pattern
      if (frequency !== 'one-time' && meetingId) {
        const [datePart, timePart] = scheduledDate.split('T');
        
        await generateRecurrence.mutateAsync({
          meeting_id: meetingId,
          tenant_id: profile.tenant_id,
          recurrence_type: frequency,
          start_date: datePart,
          start_time: timePart,
          duration_minutes: parseInt(duration),
          until_date: endRule === 'date' ? endDate : undefined,
          timezone: 'Australia/Sydney',
        });
      }

      toast({ title: frequency === 'one-time' ? 'Meeting scheduled successfully' : 'Recurring meeting series created' });
      onScheduled?.();
      onOpenChange(false);
      
      // Reset form
      setMeetingType('L10');
      setTitle('');
      setScheduledDate('');
      setDuration('90');
      setTemplateId('');
      setFacilitatorId('');
      setFrequency('one-time');
      setEndRule('never');
      setEndDate('');
    } catch (error: any) {
      toast({ title: 'Error scheduling meeting', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generate recurrence summary text
  const getRecurrenceSummary = () => {
    if (frequency === 'one-time') return null;
    
    const typeLabels = {
      weekly: 'every Monday',
      quarterly: 'last Monday of each quarter (Mar/Jun/Sep)',
      annual: 'last Monday in December',
    };
    
    const endText = endRule === 'date' && endDate 
      ? `, ending ${new Date(endDate).toLocaleDateString()}` 
      : ', no end date';
    
    return `Repeats ${typeLabels[frequency]}${endText}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Schedule EOS Meeting
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label>Meeting Type *</Label>
            <MeetingTypeSelector 
              selectedType={meetingType}
              onSelect={(type) => {
                setMeetingType(type);
                setTemplateId('');
                // Update default durations and frequency
                if (type === 'L10') {
                  setDuration('90');
                  setFrequency('weekly');
                }
                if (type === 'Quarterly') {
                  setDuration('405');
                  setFrequency('quarterly');
                }
                if (type === 'Annual') {
                  setDuration('810');
                  setFrequency('annual');
                }
              }}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="title">Meeting Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Weekly L10 - 2024 Q1"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Repeat className="h-4 w-4" />
              Frequency *
            </Label>
            <RadioGroup value={frequency} onValueChange={(v: any) => setFrequency(v)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="one-time" id="one-time" />
                <Label htmlFor="one-time" className="font-normal">One-time meeting</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="weekly" id="weekly" />
                <Label htmlFor="weekly" className="font-normal">Weekly (Level 10)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="quarterly" id="quarterly" />
                <Label htmlFor="quarterly" className="font-normal">Quarterly</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="annual" id="annual" />
                <Label htmlFor="annual" className="font-normal">Annual</Label>
              </div>
            </RadioGroup>
            {getRecurrenceSummary() && (
              <p className="text-sm text-muted-foreground mt-2">
                {getRecurrenceSummary()}
              </p>
            )}
          </div>

          {frequency !== 'one-time' && (
            <div className="space-y-2">
              <Label>End Rule</Label>
              <RadioGroup value={endRule} onValueChange={(v: any) => setEndRule(v)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="never" id="never" />
                  <Label htmlFor="never" className="font-normal">No end date</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="date" id="date" />
                  <Label htmlFor="date" className="font-normal">End by date</Label>
                </div>
              </RadioGroup>
              {endRule === 'date' && (
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-2"
                />
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="facilitator">Facilitator *</Label>
            <Select value={facilitatorId} onValueChange={setFacilitatorId}>
              <SelectTrigger id="facilitator">
                <SelectValue placeholder="Select facilitator" />
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
              <Label htmlFor="scheduled">Scheduled Date & Time *</Label>
              <Input
                id="scheduled"
                type="datetime-local"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes) *</Label>
              <Input
                id="duration"
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                min="30"
                step="15"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSchedule} disabled={isSubmitting}>
            {isSubmitting ? 'Scheduling...' : 'Schedule Meeting'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
