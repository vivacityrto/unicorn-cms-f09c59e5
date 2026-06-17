import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMyTickets } from "@/hooks/useEmailTickets";
import {
  useEmailTicketCategories,
  useEmailTicketStatuses,
} from "@/hooks/useEmailTicketCategories";
import { CategoryBadge, StatusBadge, UrgentIcon } from "./TicketBadges";

export function MyTicketsTab() {
  const { data: tickets = [], isLoading } = useMyTickets();
  const { data: categories = [] } = useEmailTicketCategories();
  const { data: statuses = [] } = useEmailTicketStatuses();

  const catByValue = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.value, c.label])),
    [categories]
  );
  const statusByValue = useMemo(
    () => Object.fromEntries(statuses.map((s) => [s.value, s.label])),
    [statuses]
  );

  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-6">Loading…</div>;
  }

  if (tickets.length === 0) {
    return (
      <div className="text-sm text-muted-foreground border rounded-md p-12 text-center">
        No tickets assigned to you
      </div>
    );
  }

  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px]">Ticket</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead className="w-[120px]">Category</TableHead>
            <TableHead className="w-[140px]">Status</TableHead>
            <TableHead className="w-[160px]">Response due</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-mono text-xs">
                {t.ticket_number}
              </TableCell>
              <TableCell className="max-w-[480px]">
                <div className="flex items-center gap-2">
                  <UrgentIcon show={t.urgent} />
                  <span className="truncate">{t.subject}</span>
                </div>
              </TableCell>
              <TableCell>
                <CategoryBadge
                  value={t.category}
                  label={t.category ? catByValue[t.category] : undefined}
                />
              </TableCell>
              <TableCell>
                <StatusBadge
                  value={t.status}
                  label={t.status ? statusByValue[t.status] : undefined}
                />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {t.response_due_at
                  ? formatDistanceToNow(new Date(t.response_due_at), {
                      addSuffix: true,
                    })
                  : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
