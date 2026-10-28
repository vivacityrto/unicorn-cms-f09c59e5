import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useCarryForwardRock } from '@/hooks/useRockCarryover';
import { useEditorRocks } from '@/hooks/useRockEditorData';
import { VIVACITY_TENANT_ID } from '@/hooks/useVivacityTeamUsers';
import { MILESTONE_STATUS } from '@/utils/milestoneStatusStyle';
import { formatDate } from '@/utils/rockPanelFormat';
import { parseMilestoneTitle } from '@/utils/rockPanelMetrics';
import {
  carryoverPreview,
  classifyMilestones,
  destinationOptions,
  destinationQuarters,
  formatQuarter,
  quarterEndIso,
  validateCarryover,
  type CarryCandidateInput,
  type CarryoverErrors,
  type CarryoverForm,
  type DestinationChoice,
} from '@/utils/rockCarryover';
import type { RockMilestoneStatus } from '@/types/eos';

interface CarryForwardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rock: {
    id: string;
    title: string;
    level: string | null;
    quarterYear: number;
    quarterNumber: number;
    parentRockId: string | null;
  };
  milestones: CarryCandidateInput[];
  /** Source milestones already carried somewhere; never offered again. */
  carriedMilestoneIds: ReadonlySet<string>;
  /** Rocks this one has already been carried into. */
  carriedToRockIds: ReadonlySet<string>;
  /** Open the Rock that now holds the carried work. */
  onOpenRock?: (rockId: string) => void;
}

const quarterKey = (year: number, quarter: number) => `${year}-${quarter}`;

/**
 * Carry the unfinished part of a Rock into a later quarter. The dialog shows the
 * effect before anything is saved: the original stays exactly as it is, nothing
 * is marked complete, and finished milestones are not copied.
 */
export function CarryForwardDialog({
  open,
  onOpenChange,
  rock,
  milestones,
  carriedMilestoneIds,
  carriedToRockIds,
  onOpenRock,
}: CarryForwardDialogProps) {
  const carry = useCarryForwardRock();
  const rocksQuery = useEditorRocks(open);
  const source = { year: rock.quarterYear, quarter: rock.quarterNumber };
  const quarters = useMemo(() => destinationQuarters(source), [rock.quarterYear, rock.quarterNumber]);

  // The Rock this one serves may itself have been carried; the destination must then serve that Rock's destination.
  const parentCarryQuery = useQuery({
    queryKey: ['eos-rock-carryover-parent', rock.parentRockId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('eos_rock_carryovers')
        .select('destination_rock_id, carried_at')
        .eq('source_rock_id', rock.parentRockId!)
        .order('carried_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0]?.destination_rock_id ?? null;
    },
    enabled: open && !!rock.parentRockId,
  });
  const parentDestinationId = parentCarryQuery.data ?? null;

  const candidates = useMemo(() => classifyMilestones(milestones, carriedMilestoneIds), [milestones, carriedMilestoneIds]);
  const carryable = candidates.filter(c => c.state === 'carry');
  const completed = candidates.filter(c => c.state === 'completed');

  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [quarter, setQuarter] = useState(quarterKey(quarters[0].year, quarters[0].quarter));
  const [newTitle, setNewTitle] = useState('');
  const [newDue, setNewDue] = useState(quarterEndIso(quarters[0]));
  const [existingId, setExistingId] = useState('');
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [done, setDone] = useState<{ destinationRockId: string; count: number } | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setMode('new');
    setQuarter(quarterKey(quarters[0].year, quarters[0].quarter));
    setNewTitle('');
    setNewDue(quarterEndIso(quarters[0]));
    setExistingId('');
    setSelected(Object.fromEntries(carryable.map(c => [c.id, ''])));
    setReason('');
    setShowErrors(false);
    setDone(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rock.id]);

  const options = useMemo(
    () =>
      destinationOptions(
        { id: rock.id, level: rock.level, quarterYear: rock.quarterYear, quarterNumber: rock.quarterNumber, tenantId: VIVACITY_TENANT_ID, parentRockId: rock.parentRockId },
        (rocksQuery.data ?? []).map(r => ({
          id: r.id,
          title: r.title,
          level: r.level,
          quarterYear: r.quarterYear,
          quarterNumber: r.quarterNumber,
          parentRockId: r.parentId,
          archived: r.archived,
          tenantId: VIVACITY_TENANT_ID,
        })),
        carriedToRockIds,
        parentDestinationId,
      ),
    [rocksQuery.data, rock, carriedToRockIds, parentDestinationId],
  );

  const [year, q] = quarter.split('-').map(Number);
  const destination: DestinationChoice =
    mode === 'new'
      ? { kind: 'new', year, quarter: q, title: newTitle, dueDate: newDue }
      : { kind: 'existing', rockId: existingId };
  const form: CarryoverForm = { destination, selected, reason };
  const { errors, valid } = validateCarryover(form, source);
  const shown: CarryoverErrors = showErrors ? errors : {};

  const chosenExisting = options.find(o => o.id === existingId);
  const destinationLabel =
    mode === 'new' ? `a new Rock in ${formatQuarter({ year, quarter: q })}` : chosenExisting ? `“${chosenExisting.title}”` : 'the chosen Rock';
  const selectedCount = Object.keys(selected).length;

  const toggle = (id: string, on: boolean) =>
    setSelected(current => {
      const next = { ...current };
      if (on) next[id] = next[id] ?? '';
      else delete next[id];
      return next;
    });

  const submit = async () => {
    if (!valid) {
      setShowErrors(true);
      if (errors.reason) reasonRef.current?.focus();
      return;
    }
    try {
      const result = await carry.mutateAsync({ sourceRockId: rock.id, form });
      setDone({ destinationRockId: result.destination_rock_id, count: result.milestones_carried });
    } catch {
      // The mutation has already explained; the form stays so nothing typed is lost.
    }
  };

  return (
    <Dialog open={open} onOpenChange={next => !carry.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        {done ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden />
                Carried forward
              </DialogTitle>
              <DialogDescription>
                {done.count === 0 ? 'The Rock was linked to its destination.' : `${done.count} ${done.count === 1 ? 'milestone was' : 'milestones were'} copied.`}{' '}
                “{rock.title}” in {formatQuarter(source)} is unchanged.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Stay here</Button>
              {onOpenRock && (
                <Button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenRock(done.destinationRockId);
                  }}
                >
                  Open the new Rock
                </Button>
              )}
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Carry forward</DialogTitle>
              <DialogDescription className="break-words">
                Move the unfinished work in “{rock.title}” into a later quarter. {formatQuarter(source)} keeps its own record.
              </DialogDescription>
            </DialogHeader>

            <form
              className="space-y-5"
              noValidate
              onSubmit={event => {
                event.preventDefault();
                void submit();
              }}
            >
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold">Where does it go?</legend>
                <RadioGroup value={mode} onValueChange={value => setMode(value as 'new' | 'existing')} className="grid gap-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem id="carry-new" value="new" />
                      <Label htmlFor="carry-new" className="font-normal">A new Rock in a later quarter</Label>
                    </div>
                    {mode === 'new' && (
                      <div className="ml-6 grid gap-2 sm:grid-cols-3">
                        <div className="space-y-1">
                          <Label htmlFor="carry-quarter" className="text-xs">Quarter</Label>
                          <Select
                            value={quarter}
                            onValueChange={value => {
                              setQuarter(value);
                              const [y, qn] = value.split('-').map(Number);
                              setNewDue(quarterEndIso({ year: y, quarter: qn }));
                            }}
                          >
                            <SelectTrigger id="carry-quarter"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {quarters.map(item => (
                                <SelectItem key={quarterKey(item.year, item.quarter)} value={quarterKey(item.year, item.quarter)}>
                                  {formatQuarter(item)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="carry-due" className="text-xs">New Rock due</Label>
                          <Input
                            id="carry-due"
                            type="date"
                            value={newDue}
                            onChange={event => setNewDue(event.target.value)}
                            aria-invalid={!!shown.dueDate}
                            aria-describedby={shown.dueDate ? 'carry-due-error' : undefined}
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-3">
                          <Label htmlFor="carry-title" className="text-xs">Title (optional, keeps “{rock.title}” if blank)</Label>
                          <Input id="carry-title" value={newTitle} onChange={event => setNewTitle(event.target.value)} maxLength={200} />
                        </div>
                        {shown.dueDate && <p id="carry-due-error" role="alert" className="text-xs text-destructive sm:col-span-3">{shown.dueDate}</p>}
                        {shown.destination && <p role="alert" className="text-xs text-destructive sm:col-span-3">{shown.destination}</p>}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem id="carry-existing" value="existing" />
                      <Label htmlFor="carry-existing" className="font-normal">A Rock that already exists</Label>
                    </div>
                    {mode === 'existing' && (
                      <div className="ml-6 space-y-1">
                        <Label htmlFor="carry-existing-select" className="text-xs">Rock</Label>
                        {rocksQuery.isLoading ? (
                          <p className="text-xs text-muted-foreground">Loading Rocks…</p>
                        ) : options.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No later {rock.level ?? 'company'} Rock fits{parentDestinationId ? ' under the Rock this one serves' : ''}. Create a new one instead.
                          </p>
                        ) : (
                          <Select value={existingId} onValueChange={setExistingId}>
                            <SelectTrigger id="carry-existing-select" aria-invalid={!!shown.destination}><SelectValue placeholder="Choose a Rock…" /></SelectTrigger>
                            <SelectContent>
                              {options.map(option => (
                                <SelectItem key={option.id} value={option.id}>
                                  {formatQuarter({ year: option.quarterYear, quarter: option.quarterNumber })} · {option.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {rocksQuery.isError && <p role="alert" className="text-xs text-destructive">Rocks could not be loaded. Close and try again.</p>}
                        {shown.destination && <p role="alert" className="text-xs text-destructive">{shown.destination}</p>}
                      </div>
                    )}
                  </div>
                </RadioGroup>
              </fieldset>

              <fieldset className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <legend className="text-sm font-semibold">Which milestones come with it?</legend>
                  {carryable.length > 1 && (
                    <span className="flex gap-1">
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSelected(Object.fromEntries(carryable.map(c => [c.id, selected[c.id] ?? ''])))}>
                        Select all
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSelected({})}>
                        Select none
                      </Button>
                    </span>
                  )}
                </div>
                {candidates.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    This Rock has no milestones. It can still be carried forward as a Rock.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {candidates.map(c => {
                      const parsed = parseMilestoneTitle(c.title);
                      const style = MILESTONE_STATUS[(c.status in MILESTONE_STATUS ? c.status : 'not_started') as RockMilestoneStatus];
                      const disabled = c.state !== 'carry';
                      const checked = c.id in selected;
                      return (
                        <li key={c.id} className="rounded-md border p-2.5">
                          <div className="flex items-start gap-2.5">
                            <Checkbox
                              id={`carry-m-${c.id}`}
                              checked={checked}
                              disabled={disabled}
                              onCheckedChange={value => toggle(c.id, value === true)}
                              className="mt-0.5"
                            />
                            <div className="min-w-0 flex-1 space-y-1">
                              <Label htmlFor={`carry-m-${c.id}`} className={disabled ? 'font-normal text-muted-foreground' : 'font-normal'}>
                                <span className="break-words">{parsed.number !== null ? `M${parsed.number} · ${parsed.label}` : parsed.label}</span>
                              </Label>
                              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                <Badge variant="outline" className={`border-transparent px-1.5 py-0 text-[10px] ${style.className}`}>{style.label}</Badge>
                                {c.dueDate && <span>Was due {formatDate(c.dueDate, 'd MMM yyyy')}</span>}
                                {c.state === 'completed' && <span>Complete. Stays in {formatQuarter(source)}, not copied.</span>}
                                {c.state === 'carried' && <span>Already carried forward.</span>}
                              </p>
                              {checked && (
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                  <Label htmlFor={`carry-d-${c.id}`} className="text-xs font-normal text-muted-foreground">New target date</Label>
                                  <Input
                                    id={`carry-d-${c.id}`}
                                    type="date"
                                    value={selected[c.id] ?? ''}
                                    onChange={event => setSelected(current => ({ ...current, [c.id]: event.target.value }))}
                                    className="h-8 w-40 text-xs"
                                  />
                                  {!selected[c.id] && <span className="text-xs text-muted-foreground">blank uses the destination’s due date</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {shown.milestoneDates && <p role="alert" className="text-xs text-destructive">{shown.milestoneDates}</p>}
              </fieldset>

              <div className="space-y-1.5">
                <Label htmlFor="carry-reason">Why is this being carried forward? <span aria-hidden className="text-destructive">*</span></Label>
                <Textarea
                  id="carry-reason"
                  ref={reasonRef}
                  value={reason}
                  onChange={event => setReason(event.target.value)}
                  rows={2}
                  maxLength={1000}
                  required
                  aria-required
                  aria-invalid={!!shown.reason}
                  aria-describedby={shown.reason ? 'carry-reason-error' : undefined}
                  placeholder="e.g. Vendor delay pushed delivery past the end of the quarter"
                />
                {shown.reason && <p id="carry-reason-error" role="alert" className="text-xs text-destructive">{shown.reason}</p>}
              </div>

              <div aria-live="polite" className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">What will happen</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {carryoverPreview(rock.title, source, destinationLabel, selectedCount, completed.length).map(line => <li key={line}>{line}</li>)}
                </ul>
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={carry.isPending}>Cancel</Button>
                <Button type="submit" disabled={carry.isPending}>
                  {carry.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                  Carry forward
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
