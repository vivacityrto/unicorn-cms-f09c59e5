import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Building2 } from 'lucide-react';

export interface TenantFilterOption {
  id: number;
  name: string;
  status: string | null;
  csc_user_id: string | null;
}

export interface TenantStatusOption {
  value: string;
  description: string;
}

export interface CscOption {
  user_uuid: string;
  first_name: string;
  last_name: string;
  archived: boolean;
}

interface TenantFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenants: TenantFilterOption[];
  statusOptions: TenantStatusOption[];
  cscOptions: CscOption[];
  selected: string[];
  onApply: (ids: string[]) => void;
}

// Every search term must appear somewhere in the name — lets "unique train"
// match "Unique Training Providers" without pulling in a fuzzy-match lib.
function matchesQuery(name: string, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = name.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function TenantFilterDialog({
  open,
  onOpenChange,
  tenants,
  statusOptions,
  cscOptions,
  selected,
  onApply,
}: TenantFilterDialogProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [cscFilter, setCscFilter] = useState('all');
  const [draft, setDraft] = useState<Set<string>>(new Set(selected));

  // Re-seed everything from the applied selection each time the dialog opens,
  // so Cancel never leaks an in-progress edit back into the page filter.
  useEffect(() => {
    if (open) {
      setDraft(new Set(selected));
      setSearch('');
      setStatusFilter('all');
      setCscFilter('all');
    }
  }, [open, selected]);

  const sortedTenants = useMemo(
    () => [...tenants].sort((a, b) => a.name.localeCompare(b.name)),
    [tenants],
  );

  const filtered = useMemo(
    () => sortedTenants.filter((t) => {
      if (!matchesQuery(t.name, search)) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (cscFilter === 'unassigned' && t.csc_user_id) return false;
      if (cscFilter !== 'all' && cscFilter !== 'unassigned' && t.csc_user_id !== cscFilter) return false;
      return true;
    }),
    [sortedTenants, search, statusFilter, cscFilter],
  );

  const hasNarrowingFilters = search !== '' || statusFilter !== 'all' || cscFilter !== 'all';

  const toggle = (id: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setDraft((prev) => {
      const next = new Set(prev);
      filtered.forEach((t) => next.add(t.id.toString()));
      return next;
    });
  };

  const clearAll = () => setDraft(new Set());

  const handleApply = () => {
    onApply(Array.from(draft));
    onOpenChange(false);
  };

  const cscLabel = (userUuid: string) => {
    const csc = cscOptions.find((c) => c.user_uuid === userUuid);
    return csc ? `${csc.first_name} ${csc.last_name}`.trim() : userUuid;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Filter by Tenant
          </DialogTitle>
          <DialogDescription>
            Narrow the list by status or CSC, search by name, then select one or more tenants.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Search tenants by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="flex-1 min-w-0">
              <SelectValue placeholder="Tenant Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tenant Status</SelectItem>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={cscFilter} onValueChange={setCscFilter}>
            <SelectTrigger className="flex-1 min-w-0">
              <SelectValue placeholder="CSC" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All CSC</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {cscOptions.map((csc) => (
                <SelectItem key={csc.user_uuid} value={csc.user_uuid}>
                  {csc.first_name} {csc.last_name}{csc.archived ? ' (archived)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{draft.size} selected</span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={selectAllFiltered}
              disabled={filtered.length === 0}
              className="text-primary hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
            >
              Select all{hasNarrowingFilters ? ' filtered' : ''}
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={draft.size === 0}
              className="text-primary hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
            >
              Clear all
            </button>
          </div>
        </div>

        {(statusFilter !== 'all' || cscFilter !== 'all') && (
          <div className="flex items-center flex-wrap gap-2 -mt-2 text-xs">
            {statusFilter !== 'all' && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                Status: {statusOptions.find((s) => s.value === statusFilter)?.description ?? statusFilter}
              </span>
            )}
            {cscFilter !== 'all' && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                CSC: {cscFilter === 'unassigned' ? 'Unassigned' : cscLabel(cscFilter)}
              </span>
            )}
            <span className="text-muted-foreground">— {filtered.length} tenant{filtered.length === 1 ? '' : 's'} match</span>
          </div>
        )}

        <ScrollArea className="h-[320px] rounded-md border">
          <div className="p-1">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground px-4">
                No tenants match the current search and filters.
              </p>
            ) : (
              filtered.map((tenant) => {
                const id = tenant.id.toString();
                const checked = draft.has(id);
                return (
                  <label
                    key={id}
                    htmlFor={`tenant-filter-${id}`}
                    className="flex items-center gap-3 rounded-md px-3 py-2 cursor-pointer hover:bg-muted/60 min-w-0"
                  >
                    <Checkbox
                      id={`tenant-filter-${id}`}
                      checked={checked}
                      onCheckedChange={() => toggle(id)}
                      className="shrink-0"
                    />
                    {/* min-w-0 + truncate keeps long tenant names from ever
                        stretching the row — they ellipsize instead. */}
                    <span className="truncate min-w-0 flex-1" title={tenant.name}>
                      {tenant.name}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply}>
            Apply{draft.size > 0 ? ` (${draft.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
