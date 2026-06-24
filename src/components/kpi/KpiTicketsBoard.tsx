import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

const PLATFORM_LABEL: Record<string, string> = { unicorn: "Unicorn CMS", complyhub_ai: "ComplyHub AI" };
const PRIORITY_LABEL: Record<string, string> = { critical: "Critical", high: "High", standard: "Standard" };
const STATUS_LABEL: Record<string, string> = {
  received: "Received", under_review: "Under Review", in_progress: "In Progress", solved: "Solved",
  open: "Open", resolved: "Resolved", closed: "Closed", blocked: "Blocked",
};

interface Ticket {
  id: number;
  ticket_number: string | null;
  title: string;
  platform: string;
  priority: string | null;
  status: string;
  assignee_uuid: string | null;
  opened_at: string;
}

interface DevUser { user_uuid: string; first_name: string | null; last_name: string | null; email: string | null; }

function fullName(u: { first_name: string | null; last_name: string | null; email: string | null } | undefined) {
  if (!u) return "—";
  return [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || "—";
}

function platformBadge(p: string) {
  const tone = p === "unicorn" ? "bg-cyan-100 text-cyan-800" : "bg-fuchsia-100 text-fuchsia-800";
  return <Badge variant="outline" className={tone}>{PLATFORM_LABEL[p] ?? p}</Badge>;
}
function priorityBadge(p: string | null) {
  if (!p) return <Badge variant="outline">—</Badge>;
  const tone =
    p === "critical" ? "bg-rose-100 text-rose-800 border-rose-200"
    : p === "high" ? "bg-amber-100 text-amber-800 border-amber-200"
    : "bg-slate-100 text-slate-700 border-slate-200";
  return <Badge variant="outline" className={tone}>{PRIORITY_LABEL[p] ?? p}</Badge>;
}
function statusBadge(s: string) {
  const tone =
    s === "solved" || s === "resolved" || s === "closed" ? "bg-emerald-100 text-emerald-800"
    : s === "in_progress" ? "bg-blue-100 text-blue-800"
    : s === "under_review" ? "bg-violet-100 text-violet-800"
    : s === "received" || s === "open" ? "bg-slate-100 text-slate-700"
    : "bg-rose-100 text-rose-800";
  return <Badge variant="outline" className={tone}>{STATUS_LABEL[s] ?? s}</Badge>;
}

export function KpiTicketsBoard() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [users, setUsers] = useState<Record<string, DevUser>>({});
  const [devs, setDevs] = useState<DevUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>("all");
  const [sheetOpen, setSheetOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: t } = await (supabase as any)
      .from("kpi_tickets")
      .select("id, ticket_number, title, platform, priority, status, assignee_uuid, opened_at")
      .order("opened_at", { ascending: false });
    const rows: Ticket[] = (t ?? []) as Ticket[];
    setTickets(rows);

    const { data: d } = await (supabase as any)
      .from("users")
      .select("user_uuid, first_name, last_name, email, kpi_role, kpi_pod")
      .eq("kpi_role", "developer")
      .or("kpi_pod.is.null,kpi_pod.neq.qa");
    const devRows: DevUser[] = (d ?? []) as DevUser[];
    setDevs(devRows);

    const map: Record<string, DevUser> = {};
    devRows.forEach((u) => { map[u.user_uuid] = u; });
    const missing = rows.map((r) => r.assignee_uuid).filter((u): u is string => !!u && !map[u]);
    if (missing.length) {
      const { data: extra } = await (supabase as any)
        .from("users")
        .select("user_uuid, first_name, last_name, email")
        .in("user_uuid", Array.from(new Set(missing)));
      (extra ?? []).forEach((u: DevUser) => { map[u.user_uuid] = u; });
    }
    setUsers(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (tab === "all") return tickets;
    return tickets.filter((t) => t.assignee_uuid === tab);
  }, [tab, tickets]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">KPI Tickets</CardTitle>
          <p className="text-sm text-muted-foreground">All tickets across Unicorn CMS and ComplyHub AI.</p>
        </div>
        <Button onClick={() => setSheetOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> Raise a ticket</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {devs.map((d) => (
              <TabsTrigger key={d.user_uuid} value={d.user_uuid}>{d.first_name ?? fullName(d)}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">No tickets to show.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket #</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned dev</TableHead>
                <TableHead>Opened</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.ticket_number ?? `#${t.id}`}</TableCell>
                  <TableCell className="max-w-md truncate">{t.title}</TableCell>
                  <TableCell>{platformBadge(t.platform)}</TableCell>
                  <TableCell>{priorityBadge(t.priority)}</TableCell>
                  <TableCell>{statusBadge(t.status)}</TableCell>
                  <TableCell>{fullName(users[t.assignee_uuid ?? ""])}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {format(parseISO(t.opened_at), "dd/MM/yyyy HH:mm")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <RaiseTicketSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        devs={devs}
        currentUuid={user?.id ?? null}
        onCreated={() => { setSheetOpen(false); load(); }}
      />
    </Card>
  );
}

function RaiseTicketSheet({
  open, onOpenChange, devs, currentUuid, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  devs: DevUser[];
  currentUuid: string | null;
  onCreated: () => void;
}) {
  const [platform, setPlatform] = useState("unicorn");
  const [priority, setPriority] = useState("standard");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setPlatform("unicorn"); setPriority("standard"); setSubject(""); setDescription(""); setAssignee("");
    }
  }, [open]);

  const submit = async () => {
    if (!subject.trim() || !description.trim() || !assignee) {
      toast.error("Subject, description and assignee are required.");
      return;
    }
    setSubmitting(true);
    try {
      const { data: num, error: numErr } = await (supabase as any).rpc("next_kpi_ticket_number", { p_platform: platform });
      if (numErr) throw numErr;
      const ticketNumber = num as string;
      const { error } = await (supabase as any).from("kpi_tickets").insert({
        ticket_number: ticketNumber,
        external_id: ticketNumber,
        platform,
        priority,
        status: "received",
        title: subject.trim(),
        assignee_uuid: assignee,
        reporter_uuid: currentUuid,
        opened_at: new Date().toISOString(),
        metadata: { description: description.trim() },
      });
      if (error) throw error;
      toast.success(`Ticket ${ticketNumber} raised`);
      onCreated();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to raise ticket");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>Raise a ticket</SheetTitle></SheetHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-1">
            <Label>Platform</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unicorn">Unicorn CMS</SelectItem>
                <SelectItem value="complyhub_ai">ComplyHub AI</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
              </SelectContent>
            </Select>
            {priority === "critical" && (
              <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                First response required within 2 hours.
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} placeholder="Steps to reproduce, expected vs actual…" />
          </div>
          <div className="space-y-1">
            <Label>Assign to</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger><SelectValue placeholder="Select a developer" /></SelectTrigger>
              <SelectContent>
                {devs.map((d) => (
                  <SelectItem key={d.user_uuid} value={d.user_uuid}>{fullName(d)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Raise ticket
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
