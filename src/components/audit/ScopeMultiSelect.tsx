import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { useTenantRtoScope, type TenantScopeItem } from '@/hooks/useTenantRtoScope';
import { cn } from '@/lib/utils';

interface ScopeMultiSelectProps {
  tenantId: number | null;
  value: string[];
  onChange: (codes: string[]) => void;
}

const GROUP_LABELS: Record<string, string> = {
  qualification: 'Qualifications',
  skillset: 'Skill Sets',
  accreditedCourse: 'Accredited Courses',
};
const GROUP_ORDER = ['qualification', 'skillset', 'accreditedCourse'];

export function ScopeMultiSelect({ tenantId, value, onChange }: ScopeMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const { data: scope = [], isLoading } = useTenantRtoScope(tenantId ?? undefined);

  const filtered = useMemo(
    () =>
      scope.filter(
        (s) =>
          s.status?.toLowerCase() === 'current' &&
          !s.is_superseded &&
          GROUP_ORDER.includes(s.scope_type),
      ),
    [scope],
  );

  const grouped = useMemo(() => {
    const g: Record<string, TenantScopeItem[]> = {};
    for (const t of GROUP_ORDER) g[t] = [];
    for (const item of filtered) g[item.scope_type]?.push(item);
    return g;
  }, [filtered]);

  const toggle = (code: string) => {
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  };

  const remove = (code: string) => onChange(value.filter((c) => c !== code));

  const toggleGroup = (codes: string[]) => {
    const allSelected = codes.every((c) => value.includes(c));
    if (allSelected) {
      onChange(value.filter((c) => !codes.includes(c)));
    } else {
      const next = new Set(value);
      codes.forEach((c) => next.add(c));
      onChange(Array.from(next));
    }
  };

  if (!tenantId) {
    return (
      <Input
        disabled
        placeholder="Select a client first to choose training products"
      />
    );
  }

  if (isLoading) {
    return (
      <Button variant="outline" disabled className="w-full justify-between">
        <span className="text-muted-foreground">Loading scope…</span>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  // Fallback: no scope rows for this tenant
  if (filtered.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          No scope records found. Scope can be imported from the TGA via the RTO Profile. You can still type qualification codes manually.
        </p>
        <Input
          value={value.join(', ')}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
          placeholder="Comma-separated qualification codes"
        />
      </div>
    );
  }

  const triggerLabel =
    value.length === 0
      ? 'Select training products…'
      : `${value.length} selected`;

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className={cn(value.length === 0 && 'text-muted-foreground')}>
              {triggerLabel}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command
            filter={(val, search) => (val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
          >
            <CommandInput placeholder="Search code or title…" />
            <CommandList className="max-h-[320px]">
              <CommandEmpty>No matching products.</CommandEmpty>
              {GROUP_ORDER.map((type, idx) => {
                const items = grouped[type];
                if (!items || items.length === 0) return null;
                const codes = items.map((i) => i.code);
                const allSelected = codes.every((c) => value.includes(c));
                return (
                  <div key={type}>
                    {idx > 0 && <CommandSeparator />}
                    <CommandGroup heading={GROUP_LABELS[type]}>
                      <CommandItem
                        value={`__all__ ${type}`}
                        onSelect={() => toggleGroup(codes)}
                        className="text-xs font-medium text-primary"
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            allSelected ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        {allSelected ? 'Deselect all' : 'Select all in group'}
                      </CommandItem>
                      {items.map((item) => {
                        const selected = value.includes(item.code);
                        return (
                          <CommandItem
                            key={item.id}
                            value={`${item.code} ${item.title}`}
                            onSelect={() => toggle(item.code)}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                selected ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                            <span className="font-mono text-xs mr-2">{item.code}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              — {item.title}
                            </span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </div>
                );
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((code) => {
            const item = filtered.find((f) => f.code === code);
            return (
              <Badge key={code} variant="secondary" className="gap-1 pr-1 font-normal">
                <span className="font-mono text-[11px]">{code}</span>
                {item && (
                  <span className="text-[11px] text-muted-foreground max-w-[180px] truncate">
                    — {item.title}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => remove(code)}
                  className="ml-0.5 rounded-sm hover:bg-muted-foreground/20 p-0.5"
                  aria-label={`Remove ${code}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
