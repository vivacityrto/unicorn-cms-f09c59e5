import { AlertTriangle, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useRetryTeamsEventFailures, useTeamsEventBatch } from '@/hooks/useTeamsEventRegistration';
import {
  batchStatusLabel,
  exclusionReasonLabel,
  isBatchRunning,
  personName,
  resultStatusLabel,
} from '@/lib/teamsEvents/format';
import { TeamsEventsError, type BatchItem } from '@/services/teamsEventsService';

interface Props {
  batchId: string;
}

function itemDetail(item: BatchItem): string {
  if (item.result_status === 'failed') return item.error_message ?? 'Registration failed';
  return exclusionReasonLabel(item.exclusion_reason);
}

function statusVariant(status: BatchItem['result_status']): 'destructive' | 'secondary' | 'outline' {
  if (status === 'failed') return 'destructive';
  if (status === 'excluded' || status === 'duplicate') return 'outline';
  return 'secondary';
}

export function TeamsEventBatchResults({ batchId }: Props) {
  const { data, error, isLoading } = useTeamsEventBatch(batchId);
  const retry = useRetryTeamsEventFailures();

  if (isLoading) {
    return (
      <div className="space-y-3" aria-label="Loading results">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not load the results</AlertTitle>
        <AlertDescription>
          {error instanceof TeamsEventsError ? error.message : 'Please close this window and reopen it.'}
        </AlertDescription>
      </Alert>
    );
  }

  const { batch, counts, items, items_truncated: truncated, stalled, can_retry: canRetry } = data;
  const running = isBatchRunning(batch.status) && !stalled;
  const total = counts.pending + counts.registered + counts.invited + counts.already_processed + counts.failed;
  const done = total - counts.pending;
  const percent = total === 0 ? 100 : Math.round((done / total) * 100);

  const handleRetry = async () => {
    try {
      const result = await retry.mutateAsync(batchId);
      if (result.retried === 0) toast.info(result.message ?? 'Nothing to retry');
      else toast.success(`Retrying ${result.retried} ${result.retried === 1 ? 'person' : 'people'}`);
    } catch (e) {
      toast.error(e instanceof TeamsEventsError ? e.message : 'Could not retry');
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : batch.status === 'completed' ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
          )}
          <span className="font-medium">{batchStatusLabel(batch.status)}</span>
          <span className="text-sm text-muted-foreground">
            {batch.event_display_name} · {batch.group_name}
          </span>
        </div>
        <Progress value={percent} aria-label="Registration progress" />
        <p className="text-sm text-muted-foreground">
          {done} of {total} processed
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5 text-sm">
        {[
          ['Registered', counts.registered + counts.invited],
          ['Already registered', counts.already_processed],
          ['Excluded', counts.excluded],
          ['Duplicate email', counts.duplicate],
          ['Failed', counts.failed],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border p-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      {stalled && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>This run stopped responding</AlertTitle>
          <AlertDescription>
            {counts.pending} {counts.pending === 1 ? 'person has' : 'people have'} not been processed yet. Resume continues
            with only the remaining people — nobody is registered twice.
          </AlertDescription>
        </Alert>
      )}

      {running && (
        <p className="text-sm text-muted-foreground">
          You can close this window. Registration keeps running and the results will be here when you reopen the batch.
        </p>
      )}

      {items.length > 0 && (
        <div className="max-h-72 overflow-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{personName(item)}</TableCell>
                  <TableCell className="break-all">{item.normalised_email ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(item.result_status)}>{resultStatusLabel(item.result_status)}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{itemDetail(item)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {truncated && (
        <p className="text-xs text-muted-foreground">Showing the first 2,000 results.</p>
      )}

      {canRetry && (
        <Button onClick={handleRetry} disabled={retry.isPending} variant="outline">
          {retry.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
          {stalled && counts.failed === 0 ? 'Resume remaining' : 'Retry failed'}
        </Button>
      )}
    </div>
  );
}
