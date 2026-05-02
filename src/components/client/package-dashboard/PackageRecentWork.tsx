import { useState } from 'react';
import { format, isSameYear } from 'date-fns';
import {
  Phone,
  Users,
  FileText,
  ClipboardCheck,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatHours, formatWorkType, cleanWorkNote } from './formatters';
import type { ClientPackageHoursRecentRow } from '@/hooks/use-client-package-hours-recent';

interface Props {
  entries: ClientPackageHoursRecentRow[];
  isLoading: boolean;
  isError: boolean;
  initiallyShown?: number; // default 5
}

interface IconStyle {
  Icon: LucideIcon;
  colorClass: string;
}

// Icon + colour mapped from work_type. Colours mirror PackageHoursBreakdown's
// palette so the two surfaces visually relate (no semantic meaning).
function iconFor(workType: string): IconStyle {
  const t = (workType || '').toLowerCase();
  if (t.includes('consult')) return { Icon: Phone, colorClass: 'text-emerald-600' };
  if (t.includes('meeting')) return { Icon: Users, colorClass: 'text-blue-600' };
  if (t.includes('document')) return { Icon: FileText, colorClass: 'text-violet-600' };
  if (t.includes('evidence') || t.includes('validation')) {
    return { Icon: ClipboardCheck, colorClass: 'text-amber-600' };
  }
  return { Icon: Clock, colorClass: 'text-slate-500' };
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return isSameYear(d, new Date()) ? format(d, 'd MMM') : format(d, 'd MMM yy');
}

function truncate(s: string, max = 80): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

function SectionHeading() {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      Recent work
    </h4>
  );
}

export function PackageRecentWork({
  entries,
  isLoading,
  isError,
  initiallyShown = 5,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <SectionHeading />
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-2">
        <SectionHeading />
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          Couldn't load recent work.
        </div>
      </div>
    );
  }

  // Empty state — hide entirely.
  if (entries.length === 0) return null;

  const visible = expanded ? entries : entries.slice(0, initiallyShown);
  const hasMore = entries.length > initiallyShown;

  return (
    <div className="space-y-2">
      <SectionHeading />
      <ul className="space-y-3">
        {visible.map((e) => {
          const { Icon, colorClass } = iconFor(e.work_type);
          const cleanedNote = cleanWorkNote(e.notes);
          return (
            <li key={e.entry_id} className="flex items-start gap-3">
              {/* Date + icon */}
              <div className="flex items-center gap-1.5 w-20 flex-shrink-0 pt-0.5">
                <Icon className={cn('h-3.5 w-3.5 shrink-0', colorClass)} />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {fmtDate(e.occurred_at)}
                </span>
              </div>

              {/* Body */}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-foreground">
                  {formatWorkType(e.work_type)}
                  {e.work_sub_type && (
                    <span className="text-muted-foreground"> · {formatWorkType(e.work_sub_type)}</span>
                  )}
                </div>
                {cleanedNote && (
                  <div className="text-xs text-muted-foreground truncate">
                    {truncate(cleanedNote, 80)}
                  </div>
                )}
              </div>

              {/* Hours */}
              <div className="w-12 flex-shrink-0 text-right text-xs font-medium tabular-nums text-foreground pt-0.5">
                {formatHours(e.hours)}
              </div>
            </li>
          );
        })}
      </ul>

      {hasMore && !expanded && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(true)}
          className="text-xs h-7 px-2"
        >
          Show more
        </Button>
      )}
    </div>
  );
}
