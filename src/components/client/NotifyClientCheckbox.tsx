import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Users } from 'lucide-react';

interface NotifyClientCheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}

/**
 * Checkbox to optionally notify the tenant's Primary Contact via email.
 * Defaults to false. Used across all Notify sections.
 */
export function NotifyClientCheckbox({ checked, onCheckedChange, className }: NotifyClientCheckboxProps) {
  return (
    <label className={`flex items-center gap-1.5 cursor-pointer ${className ?? ''}`}>
      <Checkbox
        className="h-3.5 w-3.5"
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(!!v)}
      />
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
        <Users className="h-3 w-3" />
        Notify Client (Primary Contact)
      </span>
    </label>
  );
}
