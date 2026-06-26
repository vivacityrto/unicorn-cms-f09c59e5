import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type Urgency = 'low' | 'medium' | 'high' | 'critical';

const OPTIONS: { value: Urgency; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

interface Props {
  value: Urgency;
  onChange: (v: Urgency) => void;
  id?: string;
}

export function UrgencySelect({ value, onChange, id }: Props) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Urgency)}>
      <SelectTrigger id={id}>
        <SelectValue placeholder="Select urgency" />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
