import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Download } from 'lucide-react';

export interface ExportColumnOption {
  key: string;
  label: string;
}

interface ExportColumnsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ExportColumnOption[];
  rowCount: number;
  onConfirm: (selectedKeys: string[]) => void;
}

export function ExportColumnsDialog({ open, onOpenChange, columns, rowCount, onConfirm }: ExportColumnsDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(columns.map((c) => c.key)));

  // Default to "all columns selected" every time the dialog is (re)opened.
  useEffect(() => {
    if (open) {
      setSelected(new Set(columns.map((c) => c.key)));
    }
  }, [open, columns]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(columns.map((c) => c.key)));
  const selectNone = () => setSelected(new Set());

  const handleExport = () => {
    // Preserve column config order, not checkbox-click order, so the CSV
    // header order stays predictable regardless of how columns were toggled.
    onConfirm(columns.filter((c) => selected.has(c.key)).map((c) => c.key));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export to CSV
          </DialogTitle>
          <DialogDescription>
            Choose which columns to include. Exporting {rowCount} {rowCount === 1 ? 'row' : 'rows'}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{selected.size} of {columns.length} columns</span>
          <div className="flex gap-3">
            <button type="button" onClick={selectAll} className="text-primary hover:underline">
              Select all
            </button>
            <button type="button" onClick={selectNone} className="text-primary hover:underline">
              Select none
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 max-h-[280px] overflow-y-auto pr-1">
          {columns.map((col) => (
            <label
              key={col.key}
              htmlFor={`export-col-${col.key}`}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted/60 min-w-0"
            >
              <Checkbox
                id={`export-col-${col.key}`}
                checked={selected.has(col.key)}
                onCheckedChange={() => toggle(col.key)}
                className="shrink-0"
              />
              <span className="truncate">{col.label}</span>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={selected.size === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export{selected.size > 0 ? ` (${selected.size} columns)` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
