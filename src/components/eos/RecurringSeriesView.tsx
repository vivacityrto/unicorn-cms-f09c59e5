import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Repeat, Calendar, X, PlayCircle } from 'lucide-react';
import { useEosMeetingRecurrences } from '@/hooks/useEosMeetingRecurrences';
import { format } from 'date-fns';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RecurringSeriesViewProps {
  meetingId: string;
  tenantId: number;
}

export const RecurringSeriesView = ({ meetingId, tenantId }: RecurringSeriesViewProps) => {
  const { recurrences, occurrences, cancelOccurrence, cancelSeries } = useEosMeetingRecurrences(meetingId, tenantId);
  const [expanded, setExpanded] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancellingSeriesId, setCancellingSeriesId] = useState<string | null>(null);

  if (!recurrences) return null;

  const typeLabels = {
    weekly: 'Weekly (Level 10)',
    quarterly: 'Quarterly',
    annual: 'Annual',
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      scheduled: 'default',
      cancelled: 'destructive',
      completed: 'secondary',
    };
    return <Badge variant={variants[status as keyof typeof variants] as any}>{status}</Badge>;
  };

  const handleCancelOccurrence = async (id: string) => {
    await cancelOccurrence.mutateAsync(id);
    setCancellingId(null);
  };

  const handleCancelSeries = async (id: string) => {
    await cancelSeries.mutateAsync(id);
    setCancellingSeriesId(null);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Repeat className="h-5 w-5" />
              Recurring Series
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Collapse' : 'View All Occurrences'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Type:</span>
              <p className="font-medium">{typeLabels[recurrences.recurrence_type]}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Pattern:</span>
              <p className="font-mono text-xs">{recurrences.rrule}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Starts:</span>
              <p className="font-medium">{format(new Date(recurrences.start_date), 'MMM dd, yyyy h:mm a')}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Until:</span>
              <p className="font-medium">{recurrences.until_date ? format(new Date(recurrences.until_date), 'MMM dd, yyyy') : 'No end date'}</p>
            </div>
          </div>

          {recurrences.recurrence_type === 'quarterly' && (
            <div className="bg-muted p-3 rounded-md text-sm">
              <p className="text-muted-foreground">
                Quarterly meetings occur on the last Monday of March, June, and September. 
                Quarter 4 is skipped if an Annual meeting exists for December.
              </p>
            </div>
          )}

          {expanded && occurrences && occurrences.length > 0 && (
            <div className="space-y-2 mt-4 border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold">Scheduled Occurrences ({occurrences.length})</h4>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setCancellingSeriesId(recurrences.id)}
                >
                  Cancel All Future
                </Button>
              </div>
              
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {occurrences.map((occurrence) => (
                  <div
                    key={occurrence.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-md"
                  >
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">
                          {format(new Date(occurrence.starts_at), 'EEEE, MMM dd, yyyy')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(occurrence.starts_at), 'h:mm a')} - {format(new Date(occurrence.ends_at), 'h:mm a')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(occurrence.status)}
                      {occurrence.status === 'scheduled' && new Date(occurrence.starts_at) > new Date() && (
                        <>
                          {occurrence.meeting_id && (
                            <Button size="sm" variant="outline" asChild>
                              <a href={`/eos/meeting/${occurrence.meeting_id}`}>
                                <PlayCircle className="h-4 w-4 mr-1" />
                                Start
                              </a>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setCancellingId(occurrence.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancel occurrence dialog */}
      <AlertDialog open={!!cancellingId} onOpenChange={() => setCancellingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this occurrence?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel only this specific meeting occurrence. The rest of the series will remain scheduled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancellingId && handleCancelOccurrence(cancellingId)}
            >
              Cancel Occurrence
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel series dialog */}
      <AlertDialog open={!!cancellingSeriesId} onOpenChange={() => setCancellingSeriesId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel all future occurrences?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel all future occurrences in this recurring series. Past and currently running meetings will not be affected.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Series</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancellingSeriesId && handleCancelSeries(cancellingSeriesId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel All Future
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
