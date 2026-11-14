import { Download, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useStaffOptions } from './useSupportTickets';
import {
  EMPTY_FILTERS, PRODUCT_LABEL, filtersActive, TICKET_PRODUCTS, TICKET_TYPES, TICKET_URGENCIES, TYPE_LABEL, URGENCY_LABEL,
  type DateRange, type ProductFilter, type TicketFilterState,
} from './ticketLogic';

const TRIGGER = 'h-9 min-h-11 w-full sm:min-h-9 sm:w-auto sm:min-w-[9rem]';

export function TicketFilters({
  filters, onChange, clientOptions, onExportCsv,
}: {
  filters: TicketFilterState;
  onChange: (next: TicketFilterState) => void;
  clientOptions: { id: number; name: string }[];
  onExportCsv: () => void;
}) {
  const staff = useStaffOptions();
  const set = <K extends keyof TicketFilterState>(key: K, value: TicketFilterState[K]) => onChange({ ...filters, [key]: value });
  const products: { key: ProductFilter; label: string }[] = [
    { key: 'all', label: 'All products' },
    ...TICKET_PRODUCTS.map((p) => ({ key: p as ProductFilter, label: PRODUCT_LABEL[p] })),
  ];

  return (
    <section aria-label="Filters" className="space-y-3 border-b border-border px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Label htmlFor="ticket-search" className="sr-only">Search tickets</Label>
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="ticket-search"
            type="search"
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
            placeholder="Search title, reporter, client or ST number"
            className="h-9 min-h-11 border-input bg-background pl-8 sm:min-h-9"
          />
        </div>
        <div role="group" aria-label="Product" className="flex flex-wrap gap-1.5">
          {products.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={filters.product === p.key}
              onClick={() => set('product', p.key)}
              className={cn(
                'min-h-11 rounded-full border px-3 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring sm:min-h-8',
                filters.product === p.key
                  ? 'border-brand-purple bg-brand-purple text-white'
                  : 'border-border bg-background text-foreground hover:bg-muted',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <Select value={filters.type} onValueChange={(v) => set('type', v as TicketFilterState['type'])}>
          <SelectTrigger aria-label="Type" className={TRIGGER}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TICKET_TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.urgency} onValueChange={(v) => set('urgency', v as TicketFilterState['urgency'])}>
          <SelectTrigger aria-label="Urgency" className={TRIGGER}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All urgencies</SelectItem>
            {TICKET_URGENCIES.map((u) => <SelectItem key={u} value={u}>{URGENCY_LABEL[u]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.client} onValueChange={(v) => set('client', v)}>
          <SelectTrigger aria-label="Client" className={TRIGGER}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clientOptions.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.assignee} onValueChange={(v) => set('assignee', v)}>
          <SelectTrigger aria-label="Assignee" className={TRIGGER}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Anyone</SelectItem>
            <SelectItem value="me">Assigned to me</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.range ?? 'any'} onValueChange={(v) => set('range', v === 'any' ? null : (v as DateRange))}>
          <SelectTrigger aria-label="Raised" className={TRIGGER}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any time</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 sm:min-h-9"
          disabled={!filtersActive(filters)}
          onClick={() => onChange(EMPTY_FILTERS)}
        >
          Clear filters
        </Button>
        <Button type="button" variant="outline" className="col-span-2 min-h-11 gap-1.5 text-foreground sm:ml-auto sm:min-h-9" onClick={onExportCsv}>
          <Download aria-hidden className="h-4 w-4" />
          Export CSV
        </Button>
      </div>
    </section>
  );
}
