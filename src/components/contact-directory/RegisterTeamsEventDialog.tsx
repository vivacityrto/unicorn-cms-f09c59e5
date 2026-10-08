import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, Loader2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  usePreviewTeamsEventGroup,
  useRegisterTeamsEventGroup,
  useTeamsEventsList,
} from '@/hooks/useTeamsEventRegistration';
import {
  exclusionReasonLabel,
  formatEventDateTime,
  formatEventZone,
  personName,
  webinarConfirmationMessage,
} from '@/lib/teamsEvents/format';
import { TeamsEventsError, type PreviewPerson, type PreviewResponse } from '@/services/teamsEventsService';
import { TeamsEventBatchResults } from './TeamsEventBatchResults';

export interface TeamsEventGroupOption {
  id: number;
  name: string;
  member_count: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: TeamsEventGroupOption[];
}

type Step = 'select' | 'preview' | 'results';

function errorText(error: unknown): string {
  return error instanceof TeamsEventsError ? error.message : 'Something went wrong. Please try again.';
}

function PersonList({ title, people, cap, showReason }: {
  title: string;
  people: PreviewPerson[];
  cap: number;
  showReason?: boolean;
}) {
  if (people.length === 0) return null;
  return (
    <details className="rounded-md border px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">
        {title} ({people.length}
        {people.length >= cap ? '+' : ''})
      </summary>
      <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
        {people.map((p) => (
          <li key={p.member_key} className="flex flex-wrap justify-between gap-x-3">
            <span>
              {personName(p)} <span className="text-muted-foreground">{p.email ?? ''}</span>
            </span>
            {showReason && (
              <span className="text-muted-foreground">{exclusionReasonLabel(p.reason ?? p.duplicate_of ?? '')}</span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function RegisterTeamsEventDialog({ open, onOpenChange, groups }: Props) {
  const [step, setStep] = useState<Step>('select');
  const [eventId, setEventId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);

  const events = useTeamsEventsList(open && step === 'select');
  const previewMutation = usePreviewTeamsEventGroup();
  const registerMutation = useRegisterTeamsEventGroup();

  // Start every open from a clean slate; a finished batch is reopened from results, not stale state.
  useEffect(() => {
    if (!open) {
      setStep('select');
      setEventId('');
      setGroupId('');
      setPreview(null);
      setBatchId(null);
      previewMutation.reset();
      registerMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const runPreview = async () => {
    registerMutation.reset();
    try {
      const result = await previewMutation.mutateAsync({ eventId, groupId: Number(groupId) });
      setPreview(result);
      setStep('preview');
    } catch {
      // surfaced via previewMutation.error
    }
  };

  const confirm = async () => {
    if (!preview) return;
    try {
      const result = await registerMutation.mutateAsync({
        eventId: preview.event.id,
        groupId: preview.group.id,
        previewToken: preview.preview_token,
      });
      setBatchId(result.batch_id);
      setStep('results');
    } catch (e) {
      // A changed group or expired preview needs a fresh preview, not a blind retry.
      if (e instanceof TeamsEventsError && ['membership_changed', 'preview_expired', 'preview_invalid'].includes(e.code)) {
        setStep('select');
        setPreview(null);
      }
    }
  };

  const eventList = events.data?.events ?? [];
  const canPreview = !!eventId && !!groupId && !previewMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" aria-hidden />
            Register for Teams Event
          </DialogTitle>
          <DialogDescription>
            Register the current members of a Contact Directory Group for an upcoming Teams event. Events start from now
            through the next 14 days.
          </DialogDescription>
        </DialogHeader>

        {step === 'select' && (
          <div className="space-y-5">
            {registerMutation.error && (
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Nobody was registered</AlertTitle>
                <AlertDescription>{errorText(registerMutation.error)}</AlertDescription>
              </Alert>
            )}

            <Tabs value="webinar">
              <TabsList>
                <TabsTrigger value="webinar">Webinars</TabsTrigger>
                <TabsTrigger value="meeting" disabled title="Teams Meetings are coming in a later release">
                  Meetings
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <section className="space-y-2" aria-labelledby="teams-event-heading">
              <div className="flex items-center justify-between">
                <Label id="teams-event-heading">Event</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => events.refetch()}
                  disabled={events.isFetching}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${events.isFetching ? 'animate-spin' : ''}`} />
                  Refresh events
                </Button>
              </div>

              {events.isLoading && (
                <div className="space-y-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              )}
              {events.error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Could not load Teams events</AlertTitle>
                  <AlertDescription>{errorText(events.error)}</AlertDescription>
                </Alert>
              )}
              {!events.isLoading && !events.error && eventList.length === 0 && (
                <p className="rounded-md border p-4 text-sm text-muted-foreground">
                  No published webinars start in the next 14 days.
                </p>
              )}
              {eventList.length > 0 && (
                <RadioGroup value={eventId} onValueChange={setEventId} className="gap-2">
                  {eventList.map((event) => (
                    <Label
                      key={event.id}
                      htmlFor={`teams-event-${event.id}`}
                      className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal has-[:checked]:border-primary"
                    >
                      <RadioGroupItem id={`teams-event-${event.id}`} value={event.id} className="mt-1" />
                      <span className="space-y-0.5">
                        <span className="block font-medium">{event.displayName}</span>
                        <span className="block text-sm text-muted-foreground">
                          {formatEventDateTime(event.startUtc)} {formatEventZone(event.startUtc)}
                          {event.endUtc ? ` – ${formatEventDateTime(event.endUtc).split(' at ')[1]}` : ''}
                        </span>
                        <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          Webinar · {event.organiserName ?? 'Organiser unknown'}
                          <Badge variant="secondary">Published</Badge>
                        </span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              )}
            </section>

            <section className="space-y-2">
              <Label htmlFor="teams-event-group">Contact Directory Group</Label>
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger id="teams-event-group">
                  <SelectValue placeholder={groups.length === 0 ? 'No groups yet' : 'Choose a group'} />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.name} ({g.member_count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Membership is loaded fresh from the group when you confirm — not from this page.
              </p>
            </section>

            {previewMutation.error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Could not preview</AlertTitle>
                <AlertDescription>{errorText(previewMutation.error)}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={runPreview} disabled={!canPreview}>
                {previewMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Preview
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
              {[
                ['To register', preview.counts.to_register],
                ['Already registered', preview.counts.already_processed],
                ['Excluded', preview.counts.excluded],
                ['Duplicate email', preview.counts.duplicate],
                ['Group members', preview.counts.members],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border p-2">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-lg font-semibold">{value}</dd>
                </div>
              ))}
            </dl>

            {preview.blocked && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>This webinar needs answers Unicorn can't provide</AlertTitle>
                <AlertDescription>
                  Required registration questions: {preview.required_questions.join(', ') || 'unknown'}. Remove or make
                  them optional in Teams, then preview again. Nobody has been registered.
                </AlertDescription>
              </Alert>
            )}
            {preview.questions_check === 'unverified' && (
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Registration questions couldn't be checked</AlertTitle>
                <AlertDescription>
                  If this webinar has required questions, Microsoft will reject those registrations and they will be
                  listed as failed.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <PersonList title="Excluded" people={preview.excluded} cap={preview.list_cap} showReason />
              <PersonList title="Duplicate emails (processed once)" people={preview.duplicates} cap={preview.list_cap} showReason />
              <PersonList title="Already registered for this event" people={preview.already_processed} cap={preview.list_cap} />
              <PersonList title="Will be registered" people={preview.to_register} cap={preview.list_cap} />
            </div>

            {registerMutation.error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Could not start registration</AlertTitle>
                <AlertDescription>{errorText(registerMutation.error)}</AlertDescription>
              </Alert>
            )}

            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm font-medium" role="status">
              {webinarConfirmationMessage(preview.counts.to_register, preview.event.displayName, preview.event.startUtc)}
              <span className="mt-1 block font-normal text-muted-foreground">Group: {preview.group.name}</span>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('select')} disabled={registerMutation.isPending}>
                Back
              </Button>
              <Button
                onClick={confirm}
                disabled={registerMutation.isPending || preview.blocked || preview.counts.to_register === 0}
              >
                {registerMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm and register
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'results' && batchId && (
          <div className="space-y-4">
            <TeamsEventBatchResults batchId={batchId} />
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
