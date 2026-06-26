import { Search, Download } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type TypeFilter = 'all' | 'bug' | 'suggestion' | 'improvement' | 'data_enhancement' | 'question' | 'other';
export type UrgencyFilter = 'all' | 'low' | 'medium' | 'high' | 'critical';
export type DateRangeFilter = '7d' | '30d' | '90d' | null;

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  typeFilter: TypeFilter;
  onTypeChange: (v: TypeFilter) => void;
  urgencyFilter: UrgencyFilter;
  onUrgencyChange: (v: UrgencyFilter) => void;
  clientFilter: string;
  onClientChange: (v: string) => void;
  clientOptions: { id: number; name: string }[];
  dateRange: DateRangeFilter;
  onDateRangeChange: (v: DateRangeFilter) => void;
  onExportCsv: () => void;
}

export function AdminTicketFilters(props: Props) {
  const {
    search, onSearchChange,
    typeFilter, onTypeChange,
    urgencyFilter, onUrgencyChange,
    clientFilter, onClientChange,
    clientOptions, dateRange, onDateRangeChange,
    onExportCsv,
  } = props;

  const dateChip = (val: DateRangeFilter, label: string) => (
    <button
      key={String(val) + label}
      onClick={() => onDateRangeChange(val)}
      className={cn(
        'border rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
        dateRange === val && val !== null
          ? 'bg-[#7130A0] text-white border-[#7130A0]'
          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="px-6 py-3 flex items-center gap-3 flex-wrap border-b border-gray-100 bg-white">
      <div className="relative w-56">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search tickets…"
          className="pl-8 h-9"
        />
      </div>

      <Select value={typeFilter} onValueChange={(v) => onTypeChange(v as TypeFilter)}>
        <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="bug">Something is broken</SelectItem>
          <SelectItem value="suggestion">Feature Request</SelectItem>
          <SelectItem value="improvement">UX Improvement</SelectItem>
          <SelectItem value="data_enhancement">Data Enhancement</SelectItem>
          <SelectItem value="question">Question</SelectItem>
          <SelectItem value="other">Other</SelectItem>
        </SelectContent>
      </Select>

      <Select value={urgencyFilter} onValueChange={(v) => onUrgencyChange(v as UrgencyFilter)}>
        <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Urgencies</SelectItem>
          <SelectItem value="low">Low</SelectItem>
          <SelectItem value="medium">Medium</SelectItem>
          <SelectItem value="high">High</SelectItem>
          <SelectItem value="critical">Critical</SelectItem>
        </SelectContent>
      </Select>

      <Select value={clientFilter} onValueChange={onClientChange}>
        <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Clients</SelectItem>
          {clientOptions.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1.5">
        {dateChip('7d', '7d')}
        {dateChip('30d', '30d')}
        {dateChip('90d', '90d')}
        <button
          onClick={() => onDateRangeChange(null)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-xs font-medium bg-white text-gray-600 hover:bg-gray-50"
        >
          Clear
        </button>
      </div>

      <button
        onClick={onExportCsv}
        className="ml-auto border border-gray-300 text-gray-700 text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 hover:bg-gray-50"
      >
        <Download className="h-3.5 w-3.5" />
        CSV
      </button>
    </div>
  );
}
