import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { LEVEL_LABEL } from '@/utils/rockEditor/rules';
import type { ParentCandidate } from '@/utils/rockEditor/types';
import type { RockLevel } from '@/types/eos';

interface ParentPickerProps {
  id: string;
  level: RockLevel;
  value: string | null;
  candidates: ParentCandidate[];
  quarterLabel: string;
  invalid: boolean;
  describedBy?: string;
  onChange: (parentId: string | null) => void;
  /** Offered when there is nothing to serve yet. */
  onCreateParentLevel?: (level: RockLevel) => void;
  ownerName: (id: string | null) => string;
}

export function ParentPicker({ id, level, value, candidates, quarterLabel, invalid, describedBy, onChange, onCreateParentLevel, ownerName }: ParentPickerProps) {
  if (candidates.length === 0 && !value) {
    const wanted = level === 'team' ? 'Company' : 'Company or Team';
    return (
      <div id={id} tabIndex={-1} className="rounded-md border border-dashed p-3 text-sm" aria-describedby={describedBy}>
        <p className="font-medium">There is no {wanted} Rock in {quarterLabel} to serve yet.</p>
        <p className="mt-1 text-muted-foreground">A {LEVEL_LABEL[level]} Rock needs one, so create that first, or pick another quarter above.</p>
        {onCreateParentLevel && (
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => onCreateParentLevel('company')}>
            Create a Company Rock instead
          </Button>
        )}
      </div>
    );
  }

  const groups: RockLevel[] = level === 'team' ? ['company'] : ['company', 'team'];
  return (
    <div className="flex items-center gap-2">
    <Select value={value ?? undefined} onValueChange={v => onChange(v || null)}>
      <SelectTrigger id={id} aria-invalid={invalid} aria-describedby={describedBy} aria-label="The Rock this one serves">
        <SelectValue placeholder={`Choose the ${level === 'team' ? 'Company' : 'Company or Team'} Rock this serves`} />
      </SelectTrigger>
      <SelectContent>
        {groups.map(group => {
          const items = candidates.filter(c => c.level === group);
          if (items.length === 0) return null;
          return (
            <SelectGroup key={group}>
              <SelectLabel>{LEVEL_LABEL[group]} Rocks</SelectLabel>
              {items.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  <span>{c.title}</span>
                  {c.ownerId && <span className="ml-2 text-xs text-muted-foreground">{ownerName(c.ownerId)}</span>}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
    {value && (
      <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => onChange(null)} aria-label="Clear the Rock this serves, to choose one from another quarter">
        Clear
      </Button>
    )}
    </div>
  );
}
