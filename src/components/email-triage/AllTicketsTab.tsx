import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import { useAllTickets, type EmailTicket } from "@/hooks/useEmailTickets";
import {
  useEmailTicketCategories,
  useEmailTicketStatuses,
} from "@/hooks/useEmailTicketCategories";
import { useTriageStaffOptions } from "@/hooks/useTriageStaffOptions";
import { CategoryBadge, StatusBadge, UrgentIcon } from "./TicketBadges";
import { rowBorderClass } from "./slaBorder";
import { TicketDetailPanel } from "./TicketDetailPanel";

const ALL = "__all__";

export function AllTicketsTab() {
  const { data: tickets = [], isLoading } = useAllTickets();
  const { data: categories = [] } = useEmailTicketCategories();
  const { data: statuses = [] } = useEmailTicketStatuses();
  const { data: staff = [] } = useTriageStaffOptions();

  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [assigneeFilter, setAssigneeFilter] = useState<string>(ALL);
  const [selected, setSelected] = useState<EmailTicket | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const staffByUuid = useMemo(
    () => Object.fromEntries(staff.map((s) => [s.user_uuid, s])),
    [staff]
  );
  const catByValue = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.value, c.label])),
    [categories]
  );
  const statusByValue = useMemo(
    () => Object.fromEntries(statuses.map((s) => [s.value, s.label])),
    [statuses]
  );

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (categoryFilter !== ALL && t.category !== categoryFilter) return false;
      if (statusFilter !== ALL && t.status !== statusFilter) return false;
      if (assigneeFilter !== ALL && t.assigned_to_user_id !== assigneeFilter)
        return false;
      return true;
    });
  }, [tickets, categoryFilter, statusFilter, assigneeFilter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All assignees</SelectItem>
            {staff.map((s) => (
              <SelectItem key={s.user_uuid} value={s.user_uuid}>
                {s.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground p-6">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground border rounded-md p-12 text-center">
          No tickets
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Ticket</TableHead>
                <TableHead className="w-[120px]">Category</TableHead>
                <TableHead>Sender</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead className="w-[200px]">Assignee</TableHead>
                <TableHead className="w-[130px]">Status</TableHead>
                <TableHead className="w-[160px]">Response due</TableHead>
                <TableHead className="w-[60px] text-center">SLA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => {
                const assignee = t.assigned_to_user_id
                  ? staffByUuid[t.assigned_to_user_id]
                  : null;
                return (
                  <TableRow
                    key={t.id}
                    className={cn(
                      "cursor-pointer hover:bg-muted/50",
                      rowBorderClass(t.response_due_at, t.sla_breached)
                    )}
                    onClick={() => {
                      setSelected(t);
                      setPanelOpen(true);
                    }}
                  >
                    <TableCell className="font-mono text-xs">
                      {t.ticket_number}
                    </TableCell>
                    <TableCell>
                      <CategoryBadge
                        value={t.category}
                        label={t.category ? catByValue[t.category] : undefined}
                      />
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.sender_name ?? t.sender_email}
                    </TableCell>
                    <TableCell className="max-w-[360px]">
                      <div className="flex items-center gap-2">
                        <UrgentIcon show={t.urgent} />
                        <span className="truncate">{t.subject}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {assignee ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            {assignee.avatar_url ? (
                              <AvatarImage src={assignee.avatar_url} />
                            ) : null}
                            <AvatarFallback className="text-xs">
                              {(assignee.first_name?.[0] ?? "?") +
                                (assignee.last_name?.[0] ?? "")}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm truncate">
                            {assignee.display_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          Unassigned
                        </span>
                      )}
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
                    <TableCell className="text-center">
                      {t.sla_breached ? (
                        <AlertTriangle
                          className="h-4 w-4 text-destructive inline"
                          aria-label="SLA breached"
                        />
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
