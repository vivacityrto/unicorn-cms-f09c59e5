import { AlertTriangle, Clock, Inbox, UserX } from 'lucide-react';
import type { TicketSummary } from './ticketLogic';

/** Four counts that point at work, and respect the active filters. */
export function TicketSummaryBar({ summary }: { summary: TicketSummary }) {
  const items = [
    { icon: UserX, value: String(summary.needsTriage), label: 'Needs triage' },
    { icon: AlertTriangle, value: String(summary.highCriticalOpen), label: 'High or critical open' },
    { icon: Inbox, value: String(summary.open), label: 'Open' },
    {
      icon: Clock,
      value: summary.oldestOpenDays == null ? 'None' : `${summary.oldestOpenDays} ${summary.oldestOpenDays === 1 ? 'day' : 'days'}`,
      label: 'Oldest open',
    },
  ];
  return (
    <ul aria-label="Ticket summary" className="grid grid-cols-2 gap-3 px-4 py-4 sm:px-6 lg:grid-cols-4">
      {items.map(({ icon: Icon, value, label }) => (
        <li key={label} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <Icon aria-hidden className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <span className="block text-2xl font-bold leading-none text-foreground">{value}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{label}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
