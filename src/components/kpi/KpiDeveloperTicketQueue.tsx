import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronDown, Loader2, CheckCircle2, Clock, MinusCircle } from "lucide-react";
import { format, parseISO, differenceInMinutes, addHours } from "date-fns";
import { toast } from "sonner";
import type { Json, TablesUpdate } from "@/integrations/supabase/types";

const PLATFORM_LABEL: Record<string, string> = { unicorn: "Unicorn CMS", complyhub_ai: "ComplyHub AI" };
const PRIORITY_LABEL: Record<string, string> = { critical: "Critical", high: "High", standard: "Standard" };
const STATUS_LABEL: Record<string, string> = {
  received: "Received", under_review: "Under Review", in_progress: "In Progress", solved: "Solved",
};
const STATUS_FLOW: Array<keyof typeof STATUS_LABEL> = ["received", "under_review", "in_progress", "solved"];

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
  first_response_at: string | null;
  resolved_at: string | null;
  reopen_count: number;
  metadata: Json;
}

interface Comm { id: number; ticket_id: number; comm_type: string; occurred_at: string; }
interface UserRow { user_uuid: string; first_name: string | null; last_name: string | null; email: string | null; }

function fullName(u: UserRow | undefined) {
  if (!u) return "—";
  return [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || "—";
}

const COMM_DEFS: Array<{ key: string; label: string; window?: (t: Ticket) => Date | null; condition?: (t: Ticket) => boolean; conditionText?: string }> = [
  { key: "received_ack", label: "Received acknowledgement", window: (t) => addHours(parseISO(t.opened_at), 2) },
  { key: "in_progress_notify", label: "In-progress notification", window: (t) => addHours(parseISO(t.opened_at), 12) },
  { key: "reopened_notify", label: "Reopened notification", condition: (t) => t.reopen_count > 0, conditionText: "Only required if ticket is reopened" },
  { key: "resolved_notify", label: "Resolved notification", condition: (t) => t.status === "solved", conditionText: "Required at resolution" },
];

function deltaHm(fromIso: string, toIso: string) {
  const mins = Math.max(0, differenceInMinutes(parseISO(toIso), parseISO(fromIso)));
  const h = Math.floor(mins / 60); const m = mins % 60;
  return `${h}h ${m}m`;
}

export function KpiDeveloperTicketQueue() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [commsByTicket, setCommsByTicket] = useState<Record<number, Comm[]>>({});
  const [reporters, setReporters] = useState<Record<string, UserRow>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [confirm, setConfirm] = useState<{ ticketId: number; commKey: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data: t } = await supabase
      .from("kpi_tickets")
      .select("id, ticket_number, title, platform, priority, status, reporter_uuid, assignee_uuid, opened_at, first_response_at, resolved_at, reopen_count, metadata")
      .eq("assignee_uuid", user.id)
      .order("opened_at", { ascending: false });
    const rows: Ticket[] = t ?? [];
    setTickets(rows);

    if (rows.length) {
      const ids = rows.map((r) => r.id);
      const { data: c } = await supabase
        .from("kpi_ticket_comms")
        .select("id, ticket_id, comm_type, occurred_at")
        .in("ticket_id", ids);
      const cMap: Record<number, Comm[]> = {};
      (c ?? []).forEach((x) => { (cMap[x.ticket_id] ||= []).push(x); });
      setCommsByTicket(cMap);

      const reporterIds = Array.from(new Set(rows.map((r) => r.reporter_uuid).filter(Boolean) as string[]));
      if (reporterIds.length) {
        const { data: u } = await supabase
          .from("users").select("user_uuid, first_name, last_name, email")
          .in("user_uuid", reporterIds);
        const m: Record<string, UserRow> = {};
        (u ?? []).forEach((x) => { m[x.user_uuid] = x; });
        setReporters(m);
      }
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (t: Ticket, next: string) => {
    setBusy(true);
    try {
      const patch: TablesUpdate<"kpi_tickets"> = { status: next };
      const now = new Date().toISOString();
      if (next === "in_progress") {
        if (!t.first_response_at) patch.first_response_at = now;
        if (t.status === "solved") patch.reopen_count = (t.reopen_count ?? 0) + 1;
      }
      if (next === "solved") patch.resolved_at = now;
      const { error } = await supabase.from("kpi_tickets").update(patch).eq("id", t.id);
      if (error) throw error;
      toast.success(`Status updated to ${STATUS_LABEL[next] ?? next}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setBusy(false);
    }
  };

  const logComm = async () => {
    if (!confirm || !user?.id) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("kpi_ticket_comms").insert({
        ticket_id: confirm.ticketId,
        comm_type: confirm.commKey,
        direction: "outbound",
        author_uuid: user.id,
        occurred_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("Communication logged");
      setConfirm(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to log communication");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Card><CardContent className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading tickets…
      </CardContent></Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">My ticket queue</CardTitle>
          <p className="text-sm text-muted-foreground">Tickets assigned to you, newest first.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground p-2">No tickets assigned to you.</p>
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
                    reporter={t.reporter_uuid ? reporters[t.reporter_uuid] : undefined}
                    comms={commsByTicket[t.id] ?? []}
                    busy={busy}
                    onAdvance={(next) => updateStatus(t, next)}
                    onLog={(commKey) => setConfirm({ ticketId: t.id, commKey })}
                  />
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log communication</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm you have sent this communication to the requester.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={logComm} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TicketDetail({
  ticket, reporter, comms, busy, onAdvance, onLog,
}: {
  ticket: Ticket;
  reporter: UserRow | undefined;
  comms: Comm[];
  busy: boolean;
  onAdvance: (status: string) => void;
  onLog: (commKey: string) => void;
}) {
  const description = (ticket.metadata as unknown as { description?: string } | null)?.description ?? "—";
  const commByKey = useMemo(() => {
    const m: Record<string, Comm> = {};
    comms.forEach((c) => { if (!m[c.comm_type] || parseISO(c.occurred_at) < parseISO(m[c.comm_type].occurred_at)) m[c.comm_type] = c; });
    return m;
  }, [comms]);

  return (
    <div className="border border-t-0 rounded-b-md p-4 bg-muted/20 space-y-4">
      {/* A. Full details */}
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div><div className="text-xs text-muted-foreground">Title</div><div>{ticket.title}</div></div>
        <div><div className="text-xs text-muted-foreground">Platform</div><div>{PLATFORM_LABEL[ticket.platform] ?? ticket.platform}</div></div>
        <div><div className="text-xs text-muted-foreground">Priority</div><div>{PRIORITY_LABEL[ticket.priority ?? ""] ?? ticket.priority ?? "—"}</div></div>
        <div><div className="text-xs text-muted-foreground">Raised by</div><div>{fullName(reporter)}</div></div>
        <div><div className="text-xs text-muted-foreground">Opened at</div><div>{format(parseISO(ticket.opened_at), "dd/MM/yyyy HH:mm")}</div></div>
        <div className="sm:col-span-2"><div className="text-xs text-muted-foreground">Description</div><div className="whitespace-pre-wrap">{description}</div></div>
      </div>

      {/* B. Status controls */}
      <div>
        <div className="text-xs text-muted-foreground mb-1">Status</div>
        <div className="flex flex-wrap gap-2 items-center">
          {STATUS_FLOW.map((s) => {
            const active = ticket.status === s;
            return (
              <Button
                key={s}
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() => !active && onAdvance(s)}
                disabled={busy || active}
              >
                {STATUS_LABEL[s]}
              </Button>
            );
          })}
          {ticket.status === "solved" && (
            <Button size="sm" variant="outline" onClick={() => onAdvance("in_progress")} disabled={busy}>
              Reopen
            </Button>
          )}
        </div>
      </div>

      {/* C. Comm touchpoints */}
      <div>
        <div className="text-xs text-muted-foreground mb-2">Communication touchpoints</div>
        <div className="space-y-2">
          {COMM_DEFS.map((def) => {
            const logged = commByKey[def.key];
            const conditionMet = def.condition ? def.condition(ticket) : true;
            const windowAt = def.window ? def.window(ticket) : null;
            if (logged) {
              return (
                <div key={def.key} className="flex items-center gap-2 px-3 py-2 rounded-md border border-emerald-200 bg-emerald-50 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="font-medium">{def.label}</span>
                  <span className="text-xs text-emerald-700 ml-auto">
                    Logged {format(parseISO(logged.occurred_at), "HH:mm")} · {deltaHm(ticket.opened_at, logged.occurred_at)} after opened
                  </span>
                </div>
              );
            }
            if (!conditionMet) {
              return (
                <div key={def.key} className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/40 text-sm text-muted-foreground">
                  <MinusCircle className="h-4 w-4" />
                  <span>{def.label}</span>
                  <span className="text-xs ml-auto">{def.conditionText}</span>
                </div>
              );
            }
            return (
              <div key={def.key} className="flex items-center gap-2 px-3 py-2 rounded-md border border-amber-200 bg-amber-50 text-sm">
                <Clock className="h-4 w-4 text-amber-600" />
                <span className="font-medium">{def.label}</span>
                {windowAt && (
                  <span className="text-xs text-amber-700">by {format(windowAt, "dd/MM/yyyy HH:mm")}</span>
                )}
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => onLog(def.key)} disabled={busy}>
                  Log now
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
