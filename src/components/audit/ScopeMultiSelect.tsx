import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface ScopeMultiSelectProps {
  tenantId: number | null;
  value: string[];
  onChange: (codes: string[]) => void;
}

interface TgaSearchResult {
  code: string;
  title: string;
  type?: { id?: string };
  status?: { id?: string; isCurrent?: boolean };
}

const GROUP_LABELS: Record<string, string> = {
  qualification: 'Qualifications',
  skillSet: 'Skill Sets',
  unit: 'Units of Competency',
  accreditedCourse: 'Accredited Courses',
};
const GROUP_ORDER = ['qualification', 'skillSet', 'unit', 'accreditedCourse'];

export function ScopeMultiSelect({ tenantId, value, onChange }: ScopeMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [results, setResults] = useState<TgaSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const requestIdRef = useRef(0);

  // Debounce searchText
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText.trim()), 350);
    return () => clearTimeout(t);
  }, [searchText]);

  // Live search against TGA via edge function
  useEffect(() => {
    if (debouncedSearch.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    const reqId = ++requestIdRef.current;
    setIsSearching(true);
    let cancelled = false;

    (async () => {
      try {
        const projectUrl = 'https://yxkgdalkbrriasiyyrwk.supabase.co';
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const res = await fetch(
          `${projectUrl}/functions/v1/tga-search-training?searchText=${encodeURIComponent(debouncedSearch)}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        );
        const json = await res.json();
        if (cancelled || reqId !== requestIdRef.current) return;

        const items: TgaSearchResult[] = json?.data?.results ?? json?.data?.items ?? json?.data ?? [];
        const list = Array.isArray(items) ? items : [];
        setResults(list);
      } catch {
        if (!cancelled && reqId === requestIdRef.current) setResults([]);
      } finally {
        if (!cancelled && reqId === requestIdRef.current) setIsSearching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  const filtered = useMemo(() => {
    return results.filter((r) => {
      const isCurrent =
        r.status?.isCurrent === true ||
        (r.status?.isCurrent === undefined && (r.status?.id ?? '').toLowerCase() === 'current');
      const typeId = r.type?.id;
      return isCurrent && typeId && GROUP_ORDER.includes(typeId);
    });
  }, [results]);

  const grouped = useMemo(() => {
    const g: Record<string, TgaSearchResult[]> = {};
    for (const t of GROUP_ORDER) g[t] = [];
    for (const item of filtered) {
      const typeId = item.type?.id;
      if (typeId && g[typeId]) g[typeId].push(item);
    }
    return g;
  }, [filtered]);

  // Remember titles for selected codes so badges keep their labels after searches change
  useEffect(() => {
    if (filtered.length === 0) return;
    setTitles((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const item of filtered) {
        if (!next[item.code] && item.title) {
          next[item.code] = item.title;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
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

  const triggerLabel =
    value.length === 0 ? 'Select training products…' : `${value.length} selected`;

  const showTooShort = debouncedSearch.length < 2;

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
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search training.gov.au by code or title…"
              value={searchText}
              onValueChange={setSearchText}
            />
            <CommandList className="max-h-[320px]">
              {showTooShort && !isSearching && (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  Type at least 2 characters to search.
                </div>
              )}
              {!showTooShort && isSearching && (
                <div className="py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Searching…
                </div>
              )}
              {!showTooShort && !isSearching && filtered.length === 0 && (
                <CommandEmpty>No matching products.</CommandEmpty>
              )}
              {!isSearching &&
                GROUP_ORDER.map((type, idx) => {
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
                              key={item.code}
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
            const title = titles[code];
            return (
              <Badge key={code} variant="secondary" className="gap-1 pr-1 font-normal">
                <span className="font-mono text-[11px]">{code}</span>
                {title && (
                  <span className="text-[11px] text-muted-foreground max-w-[180px] truncate">
                    — {title}
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
