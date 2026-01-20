import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QUARTER_LABELS } from '@/types/flightPlan';

interface QuarterSelectorProps {
  quarter: number;
  year: number;
  onQuarterChange: (quarter: number) => void;
  onYearChange: (year: number) => void;
}

export function QuarterSelector({ 
  quarter, 
  year, 
  onQuarterChange, 
  onYearChange 
}: QuarterSelectorProps) {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  return (
    <div className="flex items-center gap-6">
      {/* Quarter Pills */}
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map((q) => (
          <button
            key={q}
            onClick={() => onQuarterChange(q)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
              quarter === q
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-muted hover:bg-muted/80 text-muted-foreground"
            )}
          >
            {quarter === q && <Check className="w-4 h-4" />}
            {QUARTER_LABELS[q]}
          </button>
        ))}
      </div>

      {/* Year Selector */}
      <Select value={year.toString()} onValueChange={(v) => onYearChange(parseInt(v))}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={y.toString()}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
