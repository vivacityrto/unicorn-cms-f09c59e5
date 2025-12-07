import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';
import { EmptyState } from './empty-state';
import { LucideIcon } from 'lucide-react';

interface DataTableEmptyProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  columns: string[];
}

export function DataTableEmpty({ icon, title, description, action, columns }: DataTableEmptyProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col, i) => (
              <TableHead key={i}>{col}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell colSpan={columns.length} className="p-0">
              <EmptyState
                icon={icon}
                title={title}
                description={description}
                action={action}
              />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
