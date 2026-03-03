import { useState, useRef } from 'react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Check, X } from 'lucide-react';
import { codeTablesService } from '@/services/codeTablesService';
import { toast } from 'sonner';

interface CreatableSelectProps {
  /** The dd_ table name, e.g. 'dd_sms' */
  tableName: string;
  options: { value: string; label: string }[];
  value: string;
  onValueChange: (value: string) => void;
  /** Called after a new option is persisted so the parent can refresh */
  onOptionCreated?: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export function CreatableSelect({
  tableName,
  options,
  value,
  onValueChange,
  onOptionCreated,
  placeholder = 'Select...',
  disabled,
}: CreatableSelectProps) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAddCustom = async () => {
    const trimmed = customLabel.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      // Generate standardised value from label
      const generatedValue = await codeTablesService.generateValue(trimmed);
      const formattedLabel = await codeTablesService.formatLabel(trimmed);

      // Check if value already exists
      const existing = options.find(
        (o) => o.value === generatedValue || o.label.toLowerCase() === trimmed.toLowerCase()
      );

      if (existing) {
        onValueChange(existing.value);
        toast.info(`"${existing.label}" already exists — selected it.`);
      } else {
        // Determine next sort_order
        const tableData = await codeTablesService.getTableData(tableName);
        const maxSort = tableData.reduce(
          (max, row) => Math.max(max, (row.sort_order as number) || 0),
          0
        );

        await codeTablesService.createRow(tableName, {
          value: generatedValue,
          label: formattedLabel,
          is_active: true,
          sort_order: maxSort + 1,
        });

        onValueChange(generatedValue);
        onOptionCreated?.();
        toast.success(`"${formattedLabel}" added successfully.`);
      }
    } catch (err: any) {
      console.error('Failed to add custom option:', err);
      toast.error('Failed to add option: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
      setShowCustomInput(false);
      setCustomLabel('');
    }
  };

  if (showCustomInput) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          ref={inputRef}
          value={customLabel}
          onChange={(e) => setCustomLabel(e.target.value)}
          placeholder="Type new option…"
          className="h-10 text-sm"
          disabled={saving}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddCustom();
            }
            if (e.key === 'Escape') {
              setShowCustomInput(false);
              setCustomLabel('');
            }
          }}
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          onClick={handleAddCustom}
          disabled={saving || !customLabel.trim()}
        >
          <Check className="h-4 w-4 text-primary" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          onClick={() => { setShowCustomInput(false); setCustomLabel(''); }}
          disabled={saving}
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={(v) => {
      if (v === '__other__') {
        setShowCustomInput(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      } else {
        onValueChange(v);
      }
    }} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="bg-background">
        {options.filter(o => o.value).map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
        <SelectItem value="__other__" className="text-primary font-medium border-t border-border/50 mt-1">
          <span className="flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Other…
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
