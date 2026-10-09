import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { explainEmptyList } from '@/lib/teamsEvents/emptyListExplanation';
import {
  exclusionReasonLabel,
  formatEventDateTime,
  formatEventZone,
  notListedReasonLabel,
  personName,
  registrantsLabel,
  webinarConfirmationMessage,
} from '@/lib/teamsEvents/format';
import { TeamsEventsError, type PreviewPerson, type PreviewResponse } from '@/services/teamsEventsService';
import type { DirectoryPerson, GroupMemberRef } from '@/lib/contactGroups/resolveGroupMembers';
import type { PositionTypeOption } from '@/lib/roles/positionType';
import {
  addExtra,
  adjustmentsSummary,
  noAdjustments,
  removeExtra,
  skipMember,
  toRequestKeys,
  unskipMember,
  type EventAdjustments,
} from '@/lib/teamsEvents/adjustments';
import { AddPeopleToGroupPanel, type ClientOption } from './AddPeopleToGroupPanel';
import { EventOnlyPeoplePanel } from './EventOnlyPeoplePanel';
import { GroupMembersPanel } from './GroupMembersPanel';
import { RemoveMemberConfirm, type RemoveMemberRequest } from './RemoveMemberConfirm';
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
  /**
   * Optional group-management data. When `directory` is given, choosing a group
   * also offers "Manage this group": see its members, remove people, and add
   * people (or create a new contact) without leaving the modal.
   */
  directory?: DirectoryPerson[];
  groupMembers?: GroupMemberRef[];
  clients?: ClientOption[];
  positionTypeOptions?: PositionTypeOption[];
  /** Called after the group's membership or the directory changed. */
  onGroupChanged?: () => void;
}

type Step = 'select' | 'preview' | 'results';

function errorText(error: unknown): string {
  return error instanceof TeamsEventsError ? error.message : 'Something went wrong. Please try again.';
}

function PersonList({ title, people, cap, showReason, renderAction, defaultOpen }: {
  title: string;
  people: PreviewPerson[];
  cap: number;
  showReason?: boolean;
  /** An action shown at the end of each row, e.g. "Skip for this event". */
  renderAction?: (person: PreviewPerson) => ReactNode;
  defaultOpen?: boolean;
}) {
  if (people.length === 0) return null;
  return (
    <details className="rounded-md border px-3 py-2 text-sm" open={defaultOpen}>
      <summary className="cursor-pointer font-medium">
        {title} ({people.length}
        {people.length >= cap ? '+' : ''})
      </summary>
      <ul className="mt-2 max-h-48 space-y-1 overflow-auto">
        {people.map((p) => (
          <li key={p.member_key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span>
              {personName(p)} <span className="text-muted-foreground">{p.email ?? ''}</span>
              {p.inclusion === 'extra' && (
                <Badge variant="secondary" className="ml-2">
                  This event only
                </Badge>
              )}
            </span>
            <span className="flex items-center gap-2">
              {showReason && (
                <span className="text-muted-foreground">{exclusionReasonLabel(p.reason ?? p.duplicate_of ?? '')}</span>
              )}
              {renderAction?.(p)}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function RegisterTeamsEventDialog({
  open,
  onOpenChange,
  groups,
  directory,
  groupMembers = [],
  clients = [],
  positionTypeOptions = [],
  onGroupChanged,
}: Props) {
  const [removeRequest, setRemoveRequest] = useState<RemoveMemberRequest | null>(null);
  const [step, setStep] = useState<Step>('select');
  const [eventId, setEventId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  // People added for / skipped from THIS event only. Never changes the group.
  const [adjustments, setAdjustments] = useState<EventAdjustments>(noAdjustments);

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
      setAdjustments(noAdjustments);
      previewMutation.reset();
      registerMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const runPreview = async (changes: EventAdjustments = adjustments) => {
    registerMutation.reset();
    try {
      const result = await previewMutation.mutateAsync({
        eventId,
        groupId: Number(groupId),
        changes: toRequestKeys(changes),
      });
      setPreview(result);
      setStep('preview');
    } catch {
      // surfaced via previewMutation.error
    }
  };

  /** Change who is registered for this event only, then refresh the preview (and its signed token). */
  const adjustAndPreview = (next: EventAdjustments) => {
    setAdjustments(next);
    void runPreview(next);
  };

  const chooseGroup = (value: string) => {
    setGroupId(value);
    // Event-only changes belong to one group; start clean when it changes.
    setAdjustments(noAdjustments);
  };

  const confirm = async () => {
    if (!preview) return;
    try {
      const result = await registerMutation.mutateAsync({
        eventId: preview.event.id,
        groupId: preview.group.id,
        previewToken: preview.preview_token,
        changes: toRequestKeys(adjustments),
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
  const selectedGroup = groups.find((g) => String(g.id) === groupId) ?? null;
  const selectedGroupMembers = useMemo(
    () => (selectedGroup ? groupMembers.filter((m) => m.group_id === selectedGroup.id) : []),
    [groupMembers, selectedGroup],
  );
  const selectedMemberKeys = useMemo(
    () => new Set(selectedGroupMembers.map((m) => `${m.member_type === 'user' ? 'user' : 'contact'}:${m.member_id}`)),
    [selectedGroupMembers],
  );
  const skippedPeople = preview?.excluded.filter((p) => p.reason === 'skipped_for_event') ?? [];
  const otherExcluded = preview?.excluded.filter((p) => p.reason !== 'skipped_for_event') ?? [];
  const busy = previewMutation.isPending || registerMutation.isPending;
  const emptyExplanation = explainEmptyList(events.data?.diagnostics);
  const notListed = events.data?.diagnostics?.not_listed ?? [];
  const canPreview = !!eventId && !!groupId && !previewMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The base dialog sizes itself with its `size` prop (32rem by default), so the width is set explicitly here. */}
      <DialogContent className="w-[min(94vw,72rem)] max-w-none max-h-[90vh] overflow-y-auto">
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
                <div className="space-y-2 rounded-md border p-4 text-sm text-muted-foreground">
                  <p>No published webinars start in the next 14 days.</p>
                  {emptyExplanation && <p className="text-xs">{emptyExplanation}</p>}
                </div>
              )}
              {eventList.length > 0 && (
                <RadioGroup value={eventId} onValueChange={setEventId} className="gap-2">
                  {eventList.map((event) => (
                    <Label
                      key={event.id}
                      htmlFor={`teams-event-${event.id}`}
                      className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm font-normal normal-case leading-normal tracking-normal text-foreground has-[:checked]:border-primary"
                    >
                      <RadioGroupItem id={`teams-event-${event.id}`} value={event.id} className="mt-1" />
                      <span className="min-w-0 space-y-1">
                        <span className="block font-medium">{event.displayName}</span>
                        <span className="block text-muted-foreground">
                          {formatEventDateTime(event.startUtc)} {formatEventZone(event.startUtc)}
                          {event.endUtc ? ` – ${formatEventDateTime(event.endUtc).split(' at ')[1]}` : ''}
                        </span>
                        {event.description && (
                          <span className="line-clamp-2 block text-muted-foreground">{event.description}</span>
                        )}
                        <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
                          Webinar · {event.organiserName ?? 'Organiser unknown'}
                          <Badge variant="secondary">Published</Badge>
                          {registrantsLabel(event.registrants) && (
                            <span className="font-medium text-foreground">{registrantsLabel(event.registrants)}</span>
                          )}
                        </span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              )}
              {!events.isLoading && !events.error && notListed.length > 0 && (
                <details className="rounded-md border px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Upcoming webinars not listed ({notListed.length})
                  </summary>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Microsoft returned these, but they can't be registered for yet. Missing one you expect? Check its
                    status and start date here.
                  </p>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
                    {notListed.map((item, index) => (
                      <li key={`${item.display_name}-${index}`} className="flex flex-wrap justify-between gap-x-3">
                        <span>{item.display_name}</span>
                        <span className="text-muted-foreground">
                          {notListedReasonLabel(item)}
                          {item.start_utc ? ` · ${formatEventDateTime(item.start_utc)}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>

            <section className="space-y-2">
              <Label htmlFor="teams-event-group">Contact Directory Group</Label>
              <Select value={groupId} onValueChange={chooseGroup}>
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
              {directory && selectedGroup && (
                <details className="rounded-md border px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Manage this group ({selectedGroupMembers.length})
                  </summary>
                  <div className="mt-3 space-y-3">
                    <GroupMembersPanel
                      groupName={selectedGroup.name}
                      members={selectedGroupMembers}
                      directory={directory}
                      positionTypeOptions={positionTypeOptions}
                      onRemove={(m) =>
                        setRemoveRequest({
                          groupId: selectedGroup.id,
                          groupName: selectedGroup.name,
                          memberKey: m.key,
                          memberName: m.name,
                        })
                      }
                    />
                    <AddPeopleToGroupPanel
                      group={selectedGroup}
                      directory={directory}
                      memberKeys={selectedMemberKeys}
                      clients={clients}
                      positionTypeOptions={positionTypeOptions}
                      onChanged={() => onGroupChanged?.()}
                    />
                  </div>
                </details>
              )}
              {directory && selectedGroup && (
                <details className="rounded-md border px-3 py-2 text-sm" open={adjustments.extras.length > 0}>
                  <summary className="cursor-pointer font-medium">
                    Include others in this event only ({adjustments.extras.length})
                  </summary>
                  <div className="mt-3">
                    <EventOnlyPeoplePanel
                      directory={directory}
                      groupMemberKeys={selectedMemberKeys}
                      extras={adjustments.extras}
                      clients={clients}
                      positionTypeOptions={positionTypeOptions}
                      onAdd={(extra) => setAdjustments((prev) => addExtra(prev, extra))}
                      onRemove={(key) => setAdjustments((prev) => removeExtra(prev, key))}
                      onDirectoryChanged={() => onGroupChanged?.()}
                    />
                  </div>
                </details>
              )}
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
              <Button onClick={() => runPreview()} disabled={!canPreview}>
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

            {preview.counts.extras_missing ? (
              <Alert variant="warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {preview.counts.extras_missing} person{preview.counts.extras_missing === 1 ? ' you added' : 's you added'} for
                  this event no longer exist in the directory and were left out.
                </AlertDescription>
              </Alert>
            ) : null}

            {previewMutation.error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Could not update the preview</AlertTitle>
                <AlertDescription>{errorText(previewMutation.error)}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <PersonList title="Excluded" people={otherExcluded} cap={preview.list_cap} showReason />
              <PersonList title="Duplicate emails (processed once)" people={preview.duplicates} cap={preview.list_cap} showReason />
              <PersonList title="Already registered for this event" people={preview.already_processed} cap={preview.list_cap} />
              <PersonList
                title="Skipped for this event only"
                people={skippedPeople}
                cap={preview.list_cap}
                defaultOpen
                renderAction={(p) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    aria-label={`Undo skip for ${personName(p)}`}
                    onClick={() => adjustAndPreview(unskipMember(adjustments, p.member_key))}
                  >
                    Undo
                  </Button>
                )}
              />
              <PersonList
                title="Will be registered"
                people={preview.to_register}
                cap={preview.list_cap}
                defaultOpen
                renderAction={(p) =>
                  p.inclusion === 'extra' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      aria-label={`Remove ${personName(p)} from this event`}
                      onClick={() => adjustAndPreview(removeExtra(adjustments, p.member_key))}
                    >
                      Remove
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      aria-label={`Skip ${personName(p)} for this event`}
                      onClick={() => adjustAndPreview(skipMember(adjustments, p.member_key))}
                    >
                      Skip for this event
                    </Button>
                  )
                }
              />
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
              <span className="mt-1 block font-normal text-muted-foreground">
                Group: {preview.group.name}
                {adjustmentsSummary(preview.counts) ? ` · ${adjustmentsSummary(preview.counts)}` : ''}
              </span>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('select')} disabled={busy}>
                Back
              </Button>
              <Button
                onClick={confirm}
                disabled={busy || preview.blocked || preview.counts.to_register === 0}
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
      <RemoveMemberConfirm
        request={removeRequest}
        onClose={() => setRemoveRequest(null)}
        onRemoved={() => onGroupChanged?.()}
      />
    </Dialog>
  );
}
