import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTriageQueue, type EmailTicket } from "@/hooks/useEmailTickets";
import { UrgentIcon } from "./TicketBadges";
import { TriageSidePanel } from "./TriageSidePanel";

export function TriageQueueTab() {
  const { data: tickets = [], isLoading } = useTriageQueue();
  const [selected, setSelected] = useState<EmailTicket | null>(null);
  const [open, setOpen] = useState(false);

  const handleRowClick = (t: EmailTicket) => {
    setSelected(t);
    setOpen(true);
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-6">Loading…</div>;
  }

  if (tickets.length === 0) {
    return (
      <div className="text-sm text-muted-foreground border rounded-md p-12 text-center">
        No items waiting for triage
      </div>
    );
  }

  return (
    <>
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">Received</TableHead>
              <TableHead>Sender</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead className="w-[80px] text-center">Urgent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((t) => (
              <TableRow
                key={t.id}
                className="cursor-pointer"
                onClick={() => handleRowClick(t)}
              >
                <TableCell className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(t.received_at), {
                    addSuffix: true,
                  })}
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium">
                    {t.sender_name ?? "Unknown"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t.sender_email}
                  </div>
                </TableCell>
                <TableCell className="max-w-[480px]">
                  <div className="flex items-center gap-2">
                    <UrgentIcon show={t.urgent} />
                    <span className="truncate">{t.subject}</span>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  {t.urgent ? (
                    <span className="text-destructive text-xs font-semibold">
                      URGENT
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TriageSidePanel ticket={selected} open={open} onOpenChange={setOpen} />
    </>
  );
}
