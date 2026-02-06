import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, differenceInMinutes } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, Users, Check, AlertTriangle, FileText } from 'lucide-react';

interface CalendarEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  attendees: unknown;
  tenant_id: number | null;
}

interface AddTimeFromMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: number;
  clientName: string;
  onSuccess?: () => Promise<void>;
}

export function AddTimeFromMeetingDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  onSuccess
}: AddTimeFromMeetingDialogProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [saveAsDraft, setSaveAsDraft] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Fetch recent calendar events when dialog opens
  useEffect(() => {
    if (!open) return;
    
    const fetchEvents = async () => {
      setLoading(true);
      setSelectedEventId(null);
      setNotes('');
      setSaveAsDraft(false);

      // Fetch calendar events from the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data, error } = await supabase
        .from('calendar_events')
        .select('id, title, start_at, end_at, attendees, tenant_id')
        .gte('start_at', thirtyDaysAgo.toISOString())
        .lte('start_at', new Date().toISOString())
        .order('start_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching events:', error);
        setEvents([]);
      } else {
        // Calculate duration for each event
        const eventsWithDuration = (data || []).map(e => ({
          ...e,
          duration_minutes: e.end_at && e.start_at 
            ? differenceInMinutes(parseISO(e.end_at), parseISO(e.start_at))
            : 0
        }));
        setEvents(eventsWithDuration);
      }
      setLoading(false);
    };

    fetchEvents();
  }, [open]);

  const selectedEvent = events.find(e => e.id === selectedEventId);

  const handleSubmit = async () => {
    if (!selectedEvent) {
      toast({
        title: 'No meeting selected',
        description: 'Please select a meeting to import time from.',
        variant: 'destructive'
      });
      return;
    }

    if (selectedEvent.duration_minutes <= 0) {
      toast({
        title: 'Invalid meeting duration',
        description: 'This meeting has no recorded duration.',
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);

    try {
      const workDate = format(parseISO(selectedEvent.start_at), 'yyyy-MM-dd');
      
      const { data, error } = await supabase.rpc('rpc_import_meeting_time_to_client', {
        p_client_id: clientId,
        p_calendar_event_id: selectedEvent.id,
        p_minutes: selectedEvent.duration_minutes,
        p_work_date: workDate,
        p_notes: notes || `Imported from meeting: ${selectedEvent.title}`,
        p_package_id: null, // Let the function find an active package
        p_save_as_draft: saveAsDraft
      });

      if (error) throw error;

      const result = data as { 
        success: boolean; 
        error?: string;
        minutes_total?: number;
        status?: string;
        client_name?: string;
        package_allocated?: boolean;
      };

      if (!result.success) {
        throw new Error(result.error || 'Import failed');
      }

      // Format time for display
      const hours = Math.floor((result.minutes_total || 0) / 60);
      const mins = (result.minutes_total || 0) % 60;
      const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

      // Success toast
      toast({
        title: saveAsDraft 
          ? `Saved ${timeStr} as draft`
          : `Posted ${timeStr} to ${clientName}`,
        description: !result.package_allocated ? 'Not allocated to a package' : undefined,
        action: saveAsDraft ? (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate('/time-inbox')}
          >
            Review Draft
          </Button>
        ) : undefined
      });

      // Trigger refresh callback
      if (onSuccess) {
        await onSuccess();
      }

      onOpenChange(false);
    } catch (err: unknown) {
      console.error('Import error:', err);
      toast({
        title: 'Failed to import time',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Add Time from Meeting
          </DialogTitle>
          <DialogDescription>
            Select a recent meeting to import time for {clientName}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Calendar className="h-12 w-12 mb-4 opacity-50" />
              <p>No recent meetings found</p>
              <p className="text-sm">Meetings from the last 30 days will appear here</p>
            </div>
          ) : (
            <ScrollArea className="h-[350px] pr-4">
              <div className="space-y-2">
                {events.map(event => {
                  const isSelected = selectedEventId === event.id;
                  const eventDate = parseISO(event.start_at);
                  const hours = Math.floor(event.duration_minutes / 60);
                  const mins = event.duration_minutes % 60;
                  const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => setSelectedEventId(event.id)}
                      className={`w-full p-3 rounded-lg border text-left transition-colors ${
                        isSelected 
                          ? 'border-primary bg-primary/5 ring-1 ring-primary' 
                          : 'border-border hover:border-primary/50 hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {isSelected && (
                              <Check className="h-4 w-4 text-primary shrink-0" />
                            )}
                            <p className="font-medium truncate">{event.title}</p>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(eventDate, 'EEE, MMM d')}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(eventDate, 'h:mm a')}
                            </span>
                            {event.attendees && typeof event.attendees === 'string' && (
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {event.attendees.split(',').length} attendees
                              </span>
                            )}
                            {event.attendees && Array.isArray(event.attendees) && (
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {event.attendees.length} attendees
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge variant={event.duration_minutes > 0 ? 'secondary' : 'outline'} className="shrink-0">
                          {durationStr}
                        </Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Notes input */}
        {selectedEvent && (
          <div className="space-y-3 pt-4 border-t">
            <div className="space-y-2">
              <Label htmlFor="notes" className="text-sm flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                Notes (optional)
              </Label>
              <Textarea
                id="notes"
                placeholder="Add notes about this time entry..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="saveAsDraft"
                checked={saveAsDraft}
                onCheckedChange={(checked) => setSaveAsDraft(checked === true)}
              />
              <Label 
                htmlFor="saveAsDraft" 
                className="text-sm font-normal cursor-pointer"
              >
                Save as draft (review before posting)
              </Label>
            </div>

            {saveAsDraft && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                <AlertTriangle className="h-3.5 w-3.5" />
                Draft entries won't affect client totals until posted
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={!selectedEvent || submitting}
          >
            {submitting ? 'Importing...' : saveAsDraft ? 'Save as Draft' : 'Post Time'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}