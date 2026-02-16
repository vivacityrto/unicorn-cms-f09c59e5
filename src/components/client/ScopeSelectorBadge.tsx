import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type ScopeTag } from '@/hooks/useTenantMemberships';

interface ScopeSelectorBadgeProps {
  value: ScopeTag;
  onChange: (value: ScopeTag) => void;
  showSelector: boolean;
  size?: 'sm' | 'default';
}

const SCOPE_LABELS: Record<ScopeTag, string> = {
  both: 'Both (RTO + CRICOS)',
  rto: 'RTO Only',
  cricos: 'CRICOS Only',
};

const SCOPE_SHORT: Record<ScopeTag, string> = {
  both: 'Both',
  rto: 'RTO',
  cricos: 'CRICOS',
};

export function ScopeSelectorBadge({ value, onChange, showSelector, size = 'default' }: ScopeSelectorBadgeProps) {
  if (!showSelector) {
    return (
      <Badge variant="outline" className="h-7 px-2.5 text-xs font-medium">
        {SCOPE_SHORT[value]}
      </Badge>
    );
  }

  return (
    <Select value={value} onValueChange={(v) => onChange(v as ScopeTag)}>
      <SelectTrigger className={size === 'sm' ? 'w-[160px] h-7 text-xs' : 'w-[190px] h-8 text-xs'}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-popover z-50">
        <SelectItem value="both">Both (RTO + CRICOS)</SelectItem>
        <SelectItem value="rto">RTO Only</SelectItem>
        <SelectItem value="cricos">CRICOS Only</SelectItem>
      </SelectContent>
    </Select>
  );
}

export { SCOPE_LABELS, SCOPE_SHORT };
