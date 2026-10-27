import { useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ClipboardList, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { VivacityTeamPicker } from '@/components/eos/VivacityTeamPicker';
import { cn } from '@/lib/utils';
import { newMilestone } from '@/utils/rockEditor/defaults';
import { parseMilestoneList } from '@/utils/rockEditor/pasteList';
import type { EditorMilestone, MilestonePriority, ValidationResult } from '@/utils/rockEditor/types';
import type { CompanyMilestoneOption } from '@/hooks/useRockEditorData';

interface MilestonesEditorProps {
  milestones: EditorMilestone[];
  onChange: (next: EditorMilestone[]) => void;
  validation: ValidationResult;
  showErrors: boolean;
  /** Shown as the default owner and due date of a milestone that sets neither. */
  rockOwnerLabel: string;
  rockDueLabel: string;
  /** Company milestones an Individual Rock's milestones can support. */
  companyMilestones: CompanyMilestoneOption[];
  isIndividual: boolean;
}

const PRIORITIES: { value: MilestonePriority; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

export function MilestonesEditor({
  milestones, onChange, validation, showErrors, rockOwnerLabel, rockDueLabel, companyMilestones, isIndividual,
}: MilestonesEditorProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const titleRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const pending = useRef<string | null>(null);

  const update = (id: string, patch: Partial<EditorMilestone>) =>
    onChange(milestones.map(m => (m.id === id ? { ...m, ...patch } : m)));

  const add = (afterId?: string) => {
    const created = newMilestone();
    const index = afterId ? milestones.findIndex(m => m.id === afterId) + 1 : milestones.length;
    onChange([...milestones.slice(0, index), created, ...milestones.slice(index)]);
    pending.current = created.id;
    requestAnimationFrame(() => {
      titleRefs.current[created.id]?.focus();
      pending.current = null;
    });
  };

  const remove = (id: string) => onChange(milestones.filter(m => m.id !== id));

  const importPasted = () => {
    const titles = parseMilestoneList(pasteText);
    if (titles.length === 0) return;
    const existing = new Set(milestones.map(m => m.title.trim().toLowerCase()));
    const fresh = titles.filter(t => !existing.has(t.toLowerCase())).map(t => newMilestone(t));
    const kept = milestones.filter(m => m.title.trim() || m.supports.length || m.exitCriteria);
    onChange([...kept, ...fresh]);
    setPasteText('');
    setPasteOpen(false);
  };

  return (
    <section aria-labelledby="rock-milestones-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 id="rock-milestones-heading" className="text-sm font-semibold">Milestones</h3>
          <p className="text-xs text-muted-foreground">The steps that show this Rock is on track. Optional, and you can add them later.</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setPasteOpen(open => !open)} aria-expanded={pasteOpen}>
          <ClipboardList className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Paste a list
        </Button>
      </div>

      {pasteOpen && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          <Label htmlFor="rock-paste-list" className="text-xs">One milestone per line. Bullets and numbers are removed.</Label>
          <Textarea
            id="rock-paste-list"
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            rows={5}
            placeholder={'1. Draft the plan\n2. Review with the team\n3. Publish'}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setPasteOpen(false); setPasteText(''); }}>Cancel</Button>
            <Button type="button" size="sm" onClick={importPasted} disabled={parseMilestoneList(pasteText).length === 0}>
              Add {parseMilestoneList(pasteText).length || ''} milestones
            </Button>
          </div>
        </div>
      )}

      {milestones.length > 0 && (
        <ol className="space-y-2">
          {milestones.map((m, index) => {
            const open = !!expanded[m.id];
            const error = showErrors ? validation.errors[`milestone:${m.id}`] : undefined;
            const warning = validation.warnings[`milestone:${m.id}:link`];
            const detailsId = `rock-milestone-details-${m.id}`;
            return (
              <li key={m.id} className={cn('rounded-md border bg-card', error && 'border-destructive')}>
                <div className="flex items-center gap-1.5 p-2">
                  <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground" aria-hidden="true">{index + 1}</span>
                  <Input
                    ref={el => { titleRefs.current[m.id] = el; }}
                    value={m.title}
                    onChange={e => update(m.id, { title: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        if (m.title.trim()) add(m.id);
                      }
                    }}
                    placeholder="What needs to happen?"
                    aria-label={`Milestone ${index + 1} title`}
                    aria-invalid={!!error}
                    className="h-9"
                  />
                  <Button
                    type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0"
                    onClick={() => setExpanded(prev => ({ ...prev, [m.id]: !open }))}
                    aria-expanded={open} aria-controls={detailsId}
                    aria-label={`${open ? 'Hide' : 'Show'} details for milestone ${index + 1}`}
                  >
                    {open ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                  <Button
                    type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(m.id)} aria-label={`Remove milestone ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>

                {(error || warning) && (
                  <p className={cn('px-9 pb-2 text-xs', error ? 'text-destructive' : 'text-amber-700 dark:text-amber-400')} role={error ? 'alert' : undefined}>
                    {error || warning}
                  </p>
                )}

                {open && (
                  <div id={detailsId} className="grid gap-3 border-t p-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Owner</Label>
                      <VivacityTeamPicker
                        mode="single"
                        value={m.ownerId ?? ''}
                        onChange={id => update(m.id, { ownerId: id || null })}
                        placeholder={`Same as the Rock (${rockOwnerLabel})`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${detailsId}-due`} className="text-xs">Due date</Label>
                      <Input
                        id={`${detailsId}-due`} type="date" value={m.dueDate}
                        onChange={e => update(m.id, { dueDate: e.target.value })}
                        aria-describedby={`${detailsId}-due-hint`}
                      />
                      <p id={`${detailsId}-due-hint`} className="text-xs text-muted-foreground">{m.dueDate ? ' ' : `Blank uses the Rock's due date (${rockDueLabel}).`}</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Priority</Label>
                      <Select value={m.priority} onValueChange={value => update(m.id, { priority: value as MilestonePriority })}>
                        <SelectTrigger aria-label={`Priority for milestone ${index + 1}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor={`${detailsId}-exit`} className="text-xs">Done when</Label>
                      <Textarea
                        id={`${detailsId}-exit`} value={m.exitCriteria} rows={2}
                        onChange={e => update(m.id, { exitCriteria: e.target.value })}
                        placeholder="How will we know this milestone is finished?"
                      />
                    </div>
                    {isIndividual && companyMilestones.length > 0 && (
                      <fieldset className="space-y-1.5 sm:col-span-2">
                        <legend className="text-xs font-medium">Supports these Company milestones</legend>
                        <div className="space-y-1">
                          {companyMilestones.map(c => {
                            const checkboxId = `${detailsId}-supports-${c.id}`;
                            return (
                              <div key={c.id} className="flex items-start gap-2">
                                <Checkbox
                                  id={checkboxId}
                                  checked={m.supports.includes(c.id)}
                                  onCheckedChange={checked => update(m.id, {
                                    supports: checked ? [...new Set([...m.supports, c.id])] : m.supports.filter(id => id !== c.id),
                                  })}
                                />
                                <Label htmlFor={checkboxId} className="text-sm font-normal normal-case leading-snug tracking-normal">{c.title}</Label>
                              </div>
                            );
                          })}
                        </div>
                      </fieldset>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <Button type="button" variant="outline" size="sm" onClick={() => add()}>
        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Add milestone
      </Button>
    </section>
  );
}
