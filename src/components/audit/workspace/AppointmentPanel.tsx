import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CalendarIcon, Clock, MapPin, Video, Users, Check, ExternalLink, ChevronDown, X, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { AuditAppointment, AuditAttendee } from '@/types/auditWorkspace';

interface AppointmentPanelProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  appointment: AuditAppointment | null;
  defaultInstructions?: string;
  showTimeFields?: boolean;
  isScheduling: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onSchedule: (params: {
    scheduledDate: string;
    startTime?: string;
    endTime?: string;
    durationMinutes?: number;
    location?: string;
    isOnline?: boolean;
    meetingUrl?: string;
    attendees?: AuditAttendee[];
    clientInstructions?: string;
    internalNotes?: string;
  }) => void;
  onCancel?: (appointment: AuditAppointment) => void;
  onComplete?: (appointment: AuditAppointment) => void;
  syncStatus?: 'synced' | 'syncing' | 'failed' | null;
  onRetrySync?: () => void;
}

const TIME_SLOTS = Array.from({ length: 28 }, (_, i) => {
  const hour = Math.floor(i / 2) + 7;
  const min = i % 2 === 0 ? '00' : '30';
  return `${hour.toString().padStart(2, '0')}:${min}`;
});

const DURATION_OPTIONS = [
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '90', label: '1.5 hours' },
  { value: '120', label: '2 hours' },
];

export function AppointmentPanel({
  icon, title, description, appointment, defaultInstructions = '',
  showTimeFields = true, isScheduling, disabled, disabledReason,
  onSchedule, onCancel, onComplete, syncStatus, onRetrySync,
}: AppointmentPanelProps) {
  const [date, setDate] = useState<Date | undefined>();
  const [startTime, setStartTime] = useState('10:00');
  const [duration, setDuration] = useState('60');
  const [isOnline, setIsOnline] = useState(true);
  const [meetingUrl, setMeetingUrl] = useState('');
  const [location, setLocation] = useState('');
  const [instructions, setInstructions] = useState(defaultInstructions);
  const [internalNotes, setInternalNotes] = useState('');
  const [showInternalNotes, setShowInternalNotes] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const calcEndTime = (start: string, dur: number) => {
    const [h, m] = start.split(':').map(Number);
    const totalMin = h * 60 + m + dur;
    const eh = Math.floor(totalMin / 60);
    const em = totalMin % 60;
    return `${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`;
  };

  const handleSchedule = () => {
    if (!date) return;
    const endTime = calcEndTime(startTime, parseInt(duration));
    onSchedule({
      scheduledDate: format(date, 'yyyy-MM-dd'),
      startTime: showTimeFields ? startTime : undefined,
      endTime: showTimeFields ? endTime : undefined,
      durationMinutes: showTimeFields ? parseInt(duration) : undefined,
      location: isOnline ? undefined : location,
      isOnline,
      meetingUrl: isOnline ? meetingUrl : undefined,
      clientInstructions: instructions || undefined,
      internalNotes: internalNotes || undefined,
    });
  };

  // Scheduled state
  if (appointment && appointment.status !== 'cancelled' && !isEditing) {
    const isCompleted = appointment.status === 'completed';

    return (
      <Card className={cn(isCompleted && 'border-green-200 bg-green-50/30')}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {icon}
              <div>
                <h3 className="font-semibold text-sm">{title}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">
                    {appointment.scheduled_date
                      ? format(new Date(appointment.scheduled_date + 'T00:00:00'), 'EEE d MMM yyyy')
                      : '—'}
                    {appointment.scheduled_start_time && ` at ${appointment.scheduled_start_time.slice(0, 5)}`}
                  </span>
                </div>
              </div>
            </div>
            {isCompleted ? (
              <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                <Check className="h-3 w-3 mr-1" /> Completed
              </Badge>
            ) : (
              <Badge variant="outline">{appointment.status}</Badge>
            )}
          </div>

          {/* Location */}
          {appointment.is_online ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Video className="h-3.5 w-3.5" /> Online
              {appointment.meeting_url && (
                <a href={appointment.meeting_url} target="_blank" rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1">
                  Join meeting <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ) : appointment.location ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" /> {appointment.location}
            </div>
          ) : null}

          {/* Attendees */}
          {appointment.attendees && appointment.attendees.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {appointment.attendees.map((a: AuditAttendee) => a.name).join(', ')}
            </div>
          )}

          {/* Sync status */}
          {syncStatus === 'synced' && (
            <div className="text-xs text-green-600 flex items-center gap-1">
              <Check className="h-3 w-3" /> Synced to Outlook
            </div>
          )}
          {syncStatus === 'syncing' && (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Syncing...
            </div>
          )}
          {syncStatus === 'failed' && (
            <div className="text-xs text-amber-600 flex items-center gap-1">
              ⚠️ Sync failed
              {onRetrySync && (
                <button onClick={onRetrySync} className="underline hover:no-underline ml-1">Retry</button>
              )}
            </div>
          )}

          {/* Actions */}
          {!isCompleted && (
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>Edit</Button>
              {onCancel && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline" className="text-destructive">Cancel</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will cancel the {title.toLowerCase()} and notify attendees.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onCancel(appointment)} className="bg-destructive hover:bg-destructive/90">
                        Cancel appointment
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {onComplete && (
                <Button size="sm" variant="default" onClick={() => onComplete(appointment)}>
                  <Check className="h-3 w-3 mr-1" /> Mark complete
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Unscheduled / editing form
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {icon} {title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {disabled && disabledReason ? (
          <p className="text-sm text-muted-foreground italic">{disabledReason}</p>
        ) : (
          <>
            {/* Date */}
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !date && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, 'PPP') : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={date} onSelect={setDate} initialFocus disabled={(d) => d < new Date()} />
                </PopoverContent>
              </Popover>
            </div>

            {/* Time fields */}
            {showTimeFields && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Start time</Label>
                  <Select value={startTime} onValueChange={setStartTime}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIME_SLOTS.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Duration</Label>
                  <Select value={duration} onValueChange={setDuration}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map(d => (
                        <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Format toggle */}
            {showTimeFields && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Label className="text-xs">Format</Label>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant={isOnline ? 'default' : 'outline'} onClick={() => setIsOnline(true)} className="h-7 text-xs">
                      <Video className="h-3 w-3 mr-1" /> Online
                    </Button>
                    <Button size="sm" variant={!isOnline ? 'default' : 'outline'} onClick={() => setIsOnline(false)} className="h-7 text-xs">
                      <MapPin className="h-3 w-3 mr-1" /> On-site
                    </Button>
                  </div>
                </div>
                {isOnline ? (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Meeting link</Label>
                    <Input value={meetingUrl} onChange={e => setMeetingUrl(e.target.value)} placeholder="https://teams.microsoft.com/..." />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Location</Label>
                    <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Office address" />
                  </div>
                )}
              </div>
            )}

            {/* Instructions */}
            <div className="space-y-1.5">
              <Label className="text-xs">Instructions to client</Label>
              <Textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={3} />
            </div>

            {/* Internal notes */}
            <Collapsible open={showInternalNotes} onOpenChange={setShowInternalNotes}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs gap-1 px-0">
                  <ChevronDown className={cn('h-3 w-3 transition-transform', showInternalNotes && 'rotate-180')} />
                  Internal notes
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <Textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)} rows={2} placeholder="Internal notes (not visible to client)" />
              </CollapsibleContent>
            </Collapsible>

            {/* Submit */}
            <div className="flex gap-2">
              <Button onClick={handleSchedule} disabled={!date || isScheduling} className="flex-1">
                {isScheduling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {isEditing ? 'Update' : 'Schedule'}
              </Button>
              {isEditing && (
                <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
