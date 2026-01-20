import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Calendar, Clock, MapPin, LayoutTemplate } from 'lucide-react';
import { useMeetingSeries, MeetingSeries } from '@/hooks/useMeetingSeries';

interface MeetingSeriesEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  series: MeetingSeries;
}

export function MeetingSeriesEditor({ open, onOpenChange, series }: MeetingSeriesEditorProps) {
  const { updateSeries } = useMeetingSeries();
  const [title, setTitle] = useState(series.title);
  const [location, setLocation] = useState(series.location || '');
  const [durationMinutes, setDurationMinutes] = useState(series.duration_minutes);
  const [startTime, setStartTime] = useState(series.start_time);

  const handleSave = () => {
    updateSeries.mutate({
      series_id: series.id,
      title: title !== series.title ? title : undefined,
      location: location !== series.location ? location : undefined,
      duration_minutes: durationMinutes !== series.duration_minutes ? durationMinutes : undefined,
      start_time: startTime !== series.start_time ? startTime : undefined,
    }, {
      onSuccess: () => onOpenChange(false),
    });
  };

  const recurrenceLabels = {
    one_time: 'One-time',
    weekly: 'Weekly (Level 10)',
    quarterly: 'Quarterly',
    annual: 'Annual',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Edit Meeting Series
          </DialogTitle>
          <DialogDescription>
            Update the recurring meeting series settings
          </DialogDescription>
        </DialogHeader>

        <Alert variant="default" className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            Changes will apply to <strong>future meetings only</strong>. Past meetings will not change.
          </AlertDescription>
        </Alert>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Series Type</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{series.meeting_type}</span>
              <span className="text-sm text-muted-foreground">
                ({recurrenceLabels[series.recurrence_type]})
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Meeting title"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime" className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Start Time
              </Label>
              <Input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                min={15}
                max={480}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 90)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location" className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              Location
            </Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., Conference Room A, Zoom"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            disabled={updateSeries.isPending}
          >
            {updateSeries.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
