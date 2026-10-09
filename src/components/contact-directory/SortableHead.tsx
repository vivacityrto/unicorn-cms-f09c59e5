import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { DirectorySort, DirectorySortKey } from '@/lib/contactDirectory/sortRows';

interface Props {
  label: string;
  sortKey: DirectorySortKey;
  sort: DirectorySort | null;
  onSort: (key: DirectorySortKey) => void;
  className?: string;
}

/** A table header that sorts the directory when clicked (ascending, descending, off). */
export function SortableHead({ label, sortKey, sort, onSort, className }: Props) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={className}
      aria-sort={!active ? 'none' : sort.direction === 'asc' ? 'ascending' : 'descending'}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          '-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          active ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
        <Icon className={cn('h-3.5 w-3.5', !active && 'opacity-50')} aria-hidden />
      </button>
    </TableHead>
  );
}
