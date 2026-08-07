import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  count: number;
  onCarryOver: () => void;
  pending?: boolean;
}

export function CarryOverBanner({ count, onCarryOver, pending }: Props) {
  if (count <= 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-macaron-400/80 bg-brand-macaron-50 px-3.5 py-3 shadow-sm">
      <div className="flex items-center gap-2 min-w-0">
        <RotateCcw className="h-4 w-4 text-brand-macaron-700 shrink-0" />
        <p className="text-[13px] text-brand-acai-700 truncate">
          <span className="font-semibold">{count}</span> unfinished item{count === 1 ? '' : 's'} from yesterday
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        onClick={onCarryOver}
        disabled={pending}
        className="h-8 rounded-full bg-brand-macaron-500 px-3 text-brand-acai-700 hover:bg-brand-macaron-600"
      >
        Carry Over
      </Button>
    </div>
  );
}
