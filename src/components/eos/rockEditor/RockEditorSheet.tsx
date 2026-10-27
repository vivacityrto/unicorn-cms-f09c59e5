import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, Loader2, Sparkles, TriangleAlert } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VivacityTeamPicker } from '@/components/eos/VivacityTeamPicker';
import { useAuth } from '@/hooks/useAuth';
import { useVivacityTeamUsers, VIVACITY_TENANT_ID } from '@/hooks/useVivacityTeamUsers';
import { useRockEditorData } from '@/hooks/useRockEditorData';
import { useSaveRock } from '@/hooks/useSaveRock';
import { useAISuggestRock } from '@/hooks/useAISuggestRock';
import { cn } from '@/lib/utils';
import type { RockLevel } from '@/types/eos';
import { changeLevel, changeParent, changeQuarter, initialValues, newMilestone, nextInBatch } from '@/utils/rockEditor/defaults';
import { findLikelyDuplicates } from '@/utils/rockEditor/duplicates';
import { clearDraft, draftKey, isMeaningful, loadDraft, saveDraft, type RockDraft } from '@/utils/rockEditor/draft';
import { candidateParents, hasErrors, LEVEL_LABEL, validateRockEditor } from '@/utils/rockEditor/rules';
import type { RockEditorValues } from '@/utils/rockEditor/types';
import { LevelPicker } from './LevelPicker';
import { ParentPicker } from './ParentPicker';
import { MilestonesEditor } from './MilestonesEditor';

export interface RockEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the Rock starts: the level chosen from a button, and the Rock it serves. */
  initialLevel?: RockLevel;
  initialParentId?: string | null;
  /** Called with the new Rock's id once it is created and the sheet is closing. */
  onCreated?: (rockId: string) => void;
}

const FIELD_ORDER = ['level', 'quarter', 'parent', 'function', 'title', 'owner', 'dueDate'] as const;
const FIELD_LABEL: Record<string, string> = {
  level: 'Level', quarter: 'Quarter', parent: 'The Rock it serves', function: 'Team', title: 'Title', owner: 'Owner', dueDate: 'Due date',
};

const quarterLabel = (year: number, quarter: number) => `Q${quarter} ${year}`;
const fieldId = (key: string) => `rock-field-${key}`;
const storage = () => { try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; } };

export function RockEditorSheet({ open, onOpenChange, initialLevel = 'company', initialParentId = null, onCreated }: RockEditorSheetProps) {
  const { profile } = useAuth();
  const currentUserId = profile?.user_uuid ?? null;
  const { data: people } = useVivacityTeamUsers();
  const save = useSaveRock();
  const { suggestRock, isGenerating } = useAISuggestRock();

  const [values, setValues] = useState<RockEditorValues>(() => initialValues({ level: initialLevel, currentUserId }));
  const [showErrors, setShowErrors] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [draft, setDraft] = useState<RockDraft | null>(null);
  const [created, setCreated] = useState(0);
  const titleRef = useRef<HTMLInputElement>(null);

  const startKey = draftKey(initialLevel, initialParentId);
  const data = useRockEditorData({ enabled: open, level: values.level, parentId: values.parentId });
  const { rocks } = data;

  const personName = useCallback((id: string | null) => {
    const person = people?.find(p => p.user_uuid === id);
    return person ? `${person.first_name || ''} ${person.last_name || ''}`.trim() || person.email : 'Unassigned';
  }, [people]);

  // Each time the sheet opens, start fresh from where it was opened, and offer any saved draft.
  useEffect(() => {
    if (!open) return;
    const fresh = initialValues({ level: initialLevel, currentUserId });
    setValues(fresh);
    setShowErrors(false);
    setContextOpen(false);
    setDraft(loadDraft(storage(), startKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialLevel, initialParentId, startKey]);

  // Once Rocks load, adopt the Rock the sheet was opened from (its quarter becomes the form's).
  const adoptedParent = useRef<string | null>(null);
  useEffect(() => {
    if (!open) { adoptedParent.current = null; return; }
    if (!initialParentId || adoptedParent.current === initialParentId || rocks.length === 0) return;
    const parent = rocks.find(r => r.id === initialParentId);
    if (!parent) return;
    adoptedParent.current = initialParentId;
    setValues(prev => changeParent(prev, parent));
  }, [open, initialParentId, rocks]);

  // An Individual Rock defaults to its maker, once we know who that is.
  useEffect(() => {
    if (open && currentUserId) {
      setValues(prev => (prev.level === 'individual' && !prev.ownerId ? { ...prev, ownerId: currentUserId } : prev));
    }
  }, [open, currentUserId]);

  // Save what has been typed, so a closed sheet or a reload does not lose it.
  useEffect(() => {
    // While a saved draft is waiting to be restored or discarded, leave it untouched.
    if (!open || draft) return;
    const timer = setTimeout(() => saveDraft(storage(), startKey, values), 600);
    return () => clearTimeout(timer);
  }, [open, values, startKey, draft]);

  const quarter = { year: values.quarterYear, quarter: values.quarterNumber };
  const candidates = useMemo(() => candidateParents(values.level, quarter, rocks), [values.level, values.quarterYear, values.quarterNumber, rocks]); // eslint-disable-line react-hooks/exhaustive-deps
  const companyMilestoneIds = useMemo(() => new Set(data.companyMilestones.map(m => m.id)), [data.companyMilestones]);
  const validation = useMemo(
    () => validateRockEditor(values, { rocks, companyMilestoneIds: data.companyRootId ? companyMilestoneIds : undefined }),
    [values, rocks, companyMilestoneIds, data.companyRootId],
  );
  const duplicates = useMemo(() => findLikelyDuplicates(values.title, quarter, rocks, { limit: 3 }), [values.title, values.quarterYear, values.quarterNumber, rocks]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (next: Partial<RockEditorValues>) => setValues(prev => ({ ...prev, ...next }));
  const err = (key: string) => (showErrors ? validation.errors[key] : undefined);
  const parentLocksQuarter = !!values.parentId;
  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return [now - 1, now, now + 1];
  }, []);

  const failing = FIELD_ORDER.filter(key => validation.errors[key]);
  const milestoneFailing = Object.keys(validation.errors).filter(key => key.startsWith('milestone:'));

  const focusField = (key: string) => {
    const el = document.getElementById(fieldId(key));
    if (!el) return;
    el.focus();
  };

  const submit = async (another: boolean) => {
    if (save.isPending) return;
    if (hasErrors(validation)) {
      setShowErrors(true);
      const first = failing[0];
      if (first) requestAnimationFrame(() => focusField(first));
      return;
    }
    try {
      const result = await save.mutateAsync({ values });
      clearDraft(storage(), startKey);
      setDraft(null);
      setCreated(count => count + 1);
      if (result.milestoneError) {
        // The Rock exists, so closing avoids a second Create making a duplicate. The toast explains the milestones.
        onOpenChange(false);
        onCreated?.(result.id);
        return;
      }
      if (another) {
        setValues(prev => nextInBatch(prev));
        setShowErrors(false);
        requestAnimationFrame(() => titleRef.current?.focus());
      } else {
        onOpenChange(false);
        onCreated?.(result.id);
      }
    } catch {
      // The mutation already showed the error; the form stays as it was.
    }
  };

  const draftWithAI = async () => {
    const suggestion = await suggestRock({
      rock_level: values.level,
      tenant_id: VIVACITY_TENANT_ID,
      parent_rock_id: values.parentId || undefined,
      function_id: values.functionId || undefined,
      owner_id: values.ownerId || undefined,
    });
    if (!suggestion) return;
    setValues(prev => ({
      ...prev,
      title: prev.title.trim() || suggestion.title || '',
      description: prev.description.trim() || suggestion.description || '',
      issue: prev.issue.trim() || suggestion.issue || '',
      outcome: prev.outcome.trim() || suggestion.outcome || '',
      milestones: prev.milestones.some(m => m.title.trim())
        ? prev.milestones
        : (suggestion.milestones || []).map(m => newMilestone(m.text)),
    }));
    setContextOpen(true);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void submit(false);
    }
  };

  const quarterText = quarterLabel(values.quarterYear, values.quarterNumber);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
        onKeyDown={onKeyDown}
        onOpenAutoFocus={event => {
          event.preventDefault();
          // On a phone, focusing a field raises the keyboard and scrolls the level choice out of sight.
          if (window.matchMedia?.('(min-width: 640px)').matches) titleRef.current?.focus({ preventScroll: true });
        }}
      >
        <SheetHeader className="border-b px-4 py-4 pr-14 text-left sm:px-6">
          <SheetTitle>New Rock</SheetTitle>
          <SheetDescription>
            Choose what this Rock is for first. The rest fills in from there.
            {created > 0 && <span className="ml-1 font-medium text-foreground">{created} created so far.</span>}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-6">
          {draft && (
            <div role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
              <span className="mr-auto">
                You have an unfinished {LEVEL_LABEL[draft.values.level]} Rock from {new Date(draft.savedAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}: “{draft.values.title || 'Untitled'}”.
              </span>
              <Button type="button" size="sm" onClick={() => { setValues(draft.values); setDraft(null); }}>Restore it</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { clearDraft(storage(), startKey); setDraft(null); }}>Discard</Button>
            </div>
          )}

          {showErrors && (failing.length > 0 || milestoneFailing.length > 0) && (
            <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-destructive">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                {failing.length + milestoneFailing.length === 1 ? 'One thing needs fixing' : `${failing.length + milestoneFailing.length} things need fixing`}
              </p>
              <ul className="mt-2 space-y-1">
                {failing.map(key => (
                  <li key={key}>
                    <button type="button" className="text-left underline underline-offset-2" onClick={() => focusField(key)}>
                      {FIELD_LABEL[key]}: {validation.errors[key]}
                    </button>
                  </li>
                ))}
                {milestoneFailing.length > 0 && <li>Milestones: fix the highlighted rows below.</li>}
              </ul>
            </div>
          )}

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">What kind of Rock is this?</h3>
            <LevelPicker
              value={values.level}
              onChange={level => setValues(prev => changeLevel(prev, level, currentUserId))}
            />
          </section>

          <section className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1.5">
                <Label id="rock-quarter-label">Quarter</Label>
                <div className="flex gap-2" id={fieldId('quarter')} role="group" aria-labelledby="rock-quarter-label">
                  <Select
                    value={String(values.quarterNumber)}
                    disabled={parentLocksQuarter}
                    onValueChange={q => setValues(prev => changeQuarter(prev, prev.quarterYear, Number(q)))}
                  >
                    <SelectTrigger aria-label="Quarter" className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>{[1, 2, 3, 4].map(q => <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select
                    value={String(values.quarterYear)}
                    disabled={parentLocksQuarter}
                    onValueChange={y => setValues(prev => changeQuarter(prev, Number(y), prev.quarterNumber))}
                  >
                    <SelectTrigger aria-label="Year" className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {parentLocksQuarter
                  ? <p className="text-xs text-muted-foreground">Set by the Rock it serves; a Rock and its parent share a quarter.</p>
                  : err('quarter') && <p className="text-xs text-destructive">{err('quarter')}</p>}
              </div>
            </div>

            {values.level !== 'company' && (
              <div className="space-y-1.5">
                <Label htmlFor={fieldId('parent')}>
                  What does this serve? <span aria-hidden="true" className="text-destructive">*</span>
                </Label>
                <ParentPicker
                  id={fieldId('parent')}
                  level={values.level}
                  value={values.parentId}
                  candidates={candidates}
                  quarterLabel={quarterText}
                  invalid={!!err('parent')}
                  describedBy={err('parent') ? `${fieldId('parent')}-error` : undefined}
                  onChange={id => setValues(prev => changeParent(prev, rocks.find(r => r.id === id) ?? null))}
                  onCreateParentLevel={level => setValues(prev => changeLevel(prev, level, currentUserId))}
                  ownerName={personName}
                />
                {err('parent') && <p id={`${fieldId('parent')}-error`} className="text-xs text-destructive">{err('parent')}</p>}
              </div>
            )}

            {values.level === 'team' && (
              <div className="space-y-1.5">
                <Label htmlFor={fieldId('function')}>Team <span aria-hidden="true" className="text-destructive">*</span></Label>
                <Select value={values.functionId ?? undefined} onValueChange={id => patch({ functionId: id })}>
                  <SelectTrigger id={fieldId('function')} aria-invalid={!!err('function')} aria-label="Team"><SelectValue placeholder="Which team owns this?" /></SelectTrigger>
                  <SelectContent>{data.functions.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                </Select>
                {err('function') && <p className="text-xs text-destructive">{err('function')}</p>}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor={fieldId('title')}>Title <span aria-hidden="true" className="text-destructive">*</span></Label>
              <Input
                id={fieldId('title')}
                ref={titleRef}
                value={values.title}
                onChange={e => patch({ title: e.target.value })}
                placeholder={values.level === 'company' ? 'The company’s priority this quarter' : 'What will be true by quarter end?'}
                aria-invalid={!!err('title')}
                aria-describedby={err('title') ? `${fieldId('title')}-error` : undefined}
                maxLength={220}
              />
              {err('title') && <p id={`${fieldId('title')}-error`} className="text-xs text-destructive">{err('title')}</p>}
              {duplicates.length > 0 && (
                <div role="status" className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-medium">{duplicates.length === 1 ? 'A similar Rock already exists this quarter:' : 'Similar Rocks already exist this quarter:'}</p>
                    <ul className="mt-0.5 list-disc pl-4">
                      {duplicates.map(d => <li key={d.rock.id}>{d.rock.title}</li>)}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label id="rock-owner-label">
                  Owner <span aria-hidden="true" className="text-destructive">*</span>
                </Label>
                <div id={fieldId('owner')} tabIndex={-1} role="group" aria-labelledby="rock-owner-label" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <VivacityTeamPicker
                    mode="single"
                    value={values.ownerId ?? ''}
                    onChange={id => patch({ ownerId: id || null })}
                    placeholder="Who is accountable?"
                    className={cn(err('owner') && 'border-destructive')}
                  />
                </div>
                {err('owner') && <p className="text-xs text-destructive">{err('owner')}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={fieldId('dueDate')}>Due date <span aria-hidden="true" className="text-destructive">*</span></Label>
                <Input
                  id={fieldId('dueDate')} type="date" value={values.dueDate}
                  onChange={e => patch({ dueDate: e.target.value })}
                  aria-invalid={!!err('dueDate')}
                  aria-describedby={err('dueDate') || validation.warnings.dueDate ? `${fieldId('dueDate')}-note` : undefined}
                />
                {(err('dueDate') || validation.warnings.dueDate) && (
                  <p id={`${fieldId('dueDate')}-note`} className={cn('text-xs', err('dueDate') ? 'text-destructive' : 'text-amber-700 dark:text-amber-400')}>
                    {err('dueDate') || validation.warnings.dueDate}
                  </p>
                )}
              </div>
            </div>
          </section>

          <MilestonesEditor
            milestones={values.milestones}
            onChange={milestones => patch({ milestones })}
            validation={validation}
            showErrors={showErrors}
            rockOwnerLabel={values.ownerId ? personName(values.ownerId) : 'the owner'}
            rockDueLabel={values.dueDate || 'not set'}
            companyMilestones={data.companyMilestones}
            isIndividual={values.level === 'individual'}
          />

          <section className="rounded-md border">
            <button
              type="button"
              className="flex w-full items-center gap-2 p-3 text-left text-sm font-semibold"
              aria-expanded={contextOpen}
              aria-controls="rock-context"
              onClick={() => setContextOpen(open => !open)}
            >
              {contextOpen ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
              More context
              <span className="font-normal text-muted-foreground">Description, the issue it solves, the outcome</span>
            </button>
            {contextOpen && (
              <div id="rock-context" className="space-y-4 border-t p-3">
                <div className="flex justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={() => void draftWithAI()} disabled={isGenerating}>
                    {isGenerating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                    Draft with AI
                  </Button>
                </div>
                {([
                  ['description', 'Description', 'What is this Rock about?'],
                  ['issue', 'The issue it addresses', 'What problem or opportunity is behind it?'],
                  ['outcome', 'The outcome', 'What will be different when it is done?'],
                ] as const).map(([key, label, placeholder]) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`rock-${key}`}>{label}</Label>
                    <Textarea id={`rock-${key}`} rows={3} value={values[key]} onChange={e => patch({ [key]: e.target.value })} placeholder={placeholder} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" variant="outline" onClick={() => void submit(true)} disabled={save.isPending}>
            Create and add another
          </Button>
          <Button type="button" onClick={() => void submit(false)} disabled={save.isPending} aria-keyshortcuts="Control+Enter" title="Ctrl + Enter">
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            Create {LEVEL_LABEL[values.level]} Rock
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
