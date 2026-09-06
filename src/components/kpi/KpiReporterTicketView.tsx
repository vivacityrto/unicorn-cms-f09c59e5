import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Loader2, CheckCircle2, Circle } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { Json, Tables } from "@/integrations/supabase/types";

const PLATFORM_LABEL: Record<string, string> = { unicorn: "Unicorn CMS", complyhub_ai: "ComplyHub AI" };
const PRIORITY_LABEL: Record<string, string> = { critical: "Critical", high: "High", standard: "Standard" };
const STATUS_LABEL: Record<string, string> = {
  received: "Received", under_review: "Under Review", in_progress: "In Progress", solved: "Solved",
};

const COMM_DEFS: Array<{ key: string; label: string }> = [
  { key: "received_ack", label: "Received acknowledgement" },
  { key: "in_progress_notify", label: "In-progress notification" },
  { key: "reopened_notify", label: "Reopened notification" },
  { key: "resolved_notify", label: "Resolved notification" },
];

interface Ticket {
  id: number;
  ticket_number: string | null;
  title: string;
  platform: string;
  priority: string | null;
  status: string;
  reporter_uuid: string | null;
  assignee_uuid: string | null;
  opened_at: string;
  metadata: Json;
}
type Comm = Pick<Tables<"kpi_ticket_comms">, "id" | "ticket_id" | "comm_type" | "occurred_at">;
type UserRow = Pick<Tables<"users">, "user_uuid" | "first_name" | "last_name" | "email">;

function fullName(u: UserRow | undefined) {
  if (!u) return "—";
  return [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || "—";
}

export function KpiReporterTicketView() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [commsByTicket, setCommsByTicket] = useState<Record<number, Comm[]>>({});
  const [assignees, setAssignees] = useState<Record<string, UserRow>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: t } = await supabase
        .from("kpi_tickets")
        .select("id, ticket_number, title, platform, priority, status, reporter_uuid, assignee_uuid, opened_at, metadata")
        .eq("reporter_uuid", user.id)
        .order("opened_at", { ascending: false });
      const rows: Ticket[] = (t ?? []) as Ticket[];
      if (cancelled) return;
      setTickets(rows);

      if (rows.length) {
        const ids = rows.map((r) => r.id);
        const { data: c } = await supabase
          .from("kpi_ticket_comms")
          .select("id, ticket_id, comm_type, occurred_at")
          .in("ticket_id", ids);
        const cMap: Record<number, Comm[]> = {};
        (c ?? []).forEach((x: Comm) => { (cMap[x.ticket_id] ||= []).push(x); });
        if (!cancelled) setCommsByTicket(cMap);

        const assigneeIds = Array.from(new Set(rows.map((r) => r.assignee_uuid).filter(Boolean) as string[]));
        if (assigneeIds.length) {
          const { data: u } = await supabase
            .from("users").select("user_uuid, first_name, last_name, email")
            .in("user_uuid", assigneeIds);
          const m: Record<string, UserRow> = {};
          (u ?? []).forEach((x: UserRow) => { m[x.user_uuid] = x; });
          if (!cancelled) setAssignees(m);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (loading) {
    return (
      <Card><CardContent className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading tickets…
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">My raised tickets</CardTitle>
        <p className="text-sm text-muted-foreground">Tickets you have raised, newest first.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground p-2">You haven't raised any tickets yet.</p>
        ) : tickets.map((t) => {
          const isOpen = !!open[t.id];
          return (
            <Collapsible key={t.id} open={isOpen} onOpenChange={(v) => setOpen((s) => ({ ...s, [t.id]: v }))}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center gap-3 px-3 py-2 border rounded-md hover:bg-muted/50 text-left">
                  <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                  <span className="font-mono text-xs text-muted-foreground w-32 shrink-0">{t.ticket_number ?? `#${t.id}`}</span>
                  <span className="flex-1 truncate">{t.title}</span>
                  <Badge variant="outline" className="text-xs">{PLATFORM_LABEL[t.platform] ?? t.platform}</Badge>
                  <Badge variant="outline" className="text-xs">{PRIORITY_LABEL[t.priority ?? ""] ?? t.priority ?? "—"}</Badge>
                  <Badge variant="outline" className="text-xs">{STATUS_LABEL[t.status] ?? t.status}</Badge>
                  <span className="text-xs text-muted-foreground w-32 shrink-0 text-right">{format(parseISO(t.opened_at), "dd/MM/yyyy HH:mm")}</span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <TicketDetail
                  ticket={t}
                  assignee={t.assignee_uuid ? assignees[t.assignee_uuid] : undefined}
                  comms={commsByTicket[t.id] ?? []}
                />
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </CardContent>
    </Card>
  );
}

function TicketDetail({
  ticket, assignee, comms,
}: {
  ticket: Ticket;
  assignee: UserRow | undefined;
  comms: Comm[];
}) {
  const metadata = ticket.metadata;
  const description = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? String((metadata as Record<string, Json>).description ?? "—")
    : "—";
  const commByKey = useMemo(() => {
    const m: Record<string, Comm> = {};
    comms.forEach((c) => {
      if (!m[c.comm_type] || parseISO(c.occurred_at) < parseISO(m[c.comm_type].occurred_at)) {
        m[c.comm_type] = c;
      }
    });
    return m;
  }, [comms]);

  return (
    <div className="border border-t-0 rounded-b-md p-4 bg-muted/20 space-y-4">
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div><div className="text-xs text-muted-foreground">Title</div><div>{ticket.title}</div></div>
        <div><div className="text-xs text-muted-foreground">Platform</div><div>{PLATFORM_LABEL[ticket.platform] ?? ticket.platform}</div></div>
        <div><div className="text-xs text-muted-foreground">Priority</div><div>{PRIORITY_LABEL[ticket.priority ?? ""] ?? ticket.priority ?? "—"}</div></div>
        <div><div className="text-xs text-muted-foreground">Status</div><div>{STATUS_LABEL[ticket.status] ?? ticket.status}</div></div>
        <div><div className="text-xs text-muted-foreground">Assigned to</div><div>{fullName(assignee)}</div></div>
        <div><div className="text-xs text-muted-foreground">Opened at</div><div>{format(parseISO(ticket.opened_at), "dd/MM/yyyy HH:mm")}</div></div>
        <div className="sm:col-span-2"><div className="text-xs text-muted-foreground">Description</div><div className="whitespace-pre-wrap">{description}</div></div>
      </div>

      <div>
        <div className="text-xs text-muted-foreground mb-2">Communications received</div>
        <div className="space-y-2">
          {COMM_DEFS.map((def) => {
            const logged = commByKey[def.key];
            if (logged) {
              return (
                <div key={def.key} className="flex items-center gap-2 px-3 py-2 rounded-md border border-emerald-200 bg-emerald-50 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="font-medium">{def.label}</span>
                  <span className="text-xs text-emerald-700 ml-auto">
                    {format(parseISO(logged.occurred_at), "dd/MM/yyyy HH:mm")}
                  </span>
                </div>
              );
            }
            return (
              <div key={def.key} className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/40 text-sm text-muted-foreground">
                <Circle className="h-4 w-4" />
                <span>{def.label}</span>
                <span className="text-xs ml-auto">Pending</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
