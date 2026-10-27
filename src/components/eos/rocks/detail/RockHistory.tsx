import { useState } from 'react';
import { ChevronDown, ChevronRight, History } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useRockHistory } from '@/hooks/useRockLifecycle';
import { formatDate } from '@/utils/rockPanelFormat';
import { describeEvent } from '@/utils/rockLifecycle';

interface RockHistoryProps {
  rockId: string;
  nameOf: (userId: string | null) => string;
}

/** Who changed the Rock, newest first. Collapsed until asked for. */
export function RockHistory({ rockId, nameOf }: RockHistoryProps) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useRockHistory(rockId, open);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 rounded text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {open ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
        <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        Recent changes
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        {isLoading && <p className="text-xs text-muted-foreground" role="status">Loading…</p>}
        {isError && <p className="text-xs text-muted-foreground">Change history is not available yet.</p>}
        {data && data.length === 0 && <p className="text-xs text-muted-foreground">No changes recorded yet. History starts from when it was switched on.</p>}
        {data && data.length > 0 && (
          <ol className="space-y-2 border-l pl-4">
            {data.map(event => (
              <li key={event.id} className="text-sm">
                <p>{describeEvent(event, nameOf)}</p>
                <p className="text-xs text-muted-foreground">{formatDate(event.occurred_at)}</p>
              </li>
            ))}
          </ol>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
