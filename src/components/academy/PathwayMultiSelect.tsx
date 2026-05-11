import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ACADEMY_PATHWAYS } from "@/lib/academy/pathways";
import {
  Users,
  ShieldCheck,
  Building2,
  HeartHandshake,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Users,
  ShieldCheck,
  Building2,
  HeartHandshake,
  ClipboardList,
};

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

export function PathwayMultiSelect({ value, onChange }: Props) {
  const selected = new Set(value ?? []);

  const toggle = (v: string) => {
    const next = ACADEMY_PATHWAYS.map((p) => p.value).filter((pv) =>
      pv === v ? !selected.has(pv) : selected.has(pv)
    );
    onChange(next);
  };

  return (
    <div className="space-y-1.5 rounded-md border p-2" style={{ borderColor: "hsl(var(--border))" }}>
      {ACADEMY_PATHWAYS.map((p) => {
        const Icon = ICONS[p.icon] ?? Users;
        const checked = selected.has(p.value);
        const id = `pathway-${p.value}`;
        return (
          <div
            key={p.value}
            className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-muted/40 transition-colors cursor-pointer"
            onClick={() => toggle(p.value)}
          >
            <Checkbox
              id={id}
              checked={checked}
              onCheckedChange={() => toggle(p.value)}
              onClick={(e) => e.stopPropagation()}
            />
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            <Label htmlFor={id} className="text-sm cursor-pointer flex-1">
              {p.label}
            </Label>
          </div>
        );
      })}
    </div>
  );
}

export default PathwayMultiSelect;
