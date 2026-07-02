import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Check, X, Minus, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import {
  KPI_V2_PERIOD_LABEL,
  getPeriodRange,
  type KpiV2Period,
} from "./types";

export type KpiDrillDownKind =
  | "retention"
  | "communication"
  | "csc_tasks"
  | "assistant_tasks";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: KpiDrillDownKind;
  subjectUuid: string;
  period: KpiV2Period;
  /** Short metric label shown at top of the sheet, e.g. "79% · 19 of 24 messages replied within 12 hrs". */
  metricText: string;
  /** KPI display name for the title (e.g. "Communication"). */
  label: string;
}

const KIND_DESCRIPTION: Record<KpiDrillDownKind, string> = {
  retention: "Every client assigned to you during this period.",
  communication: "Every client message counted toward the 12-hour SLA.",
  csc_tasks: "Every package task assigned to you in this period.",
  assistant_tasks: "Every task assigned to you across all sources.",
};

function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd MMM yyyy, h:mm a");
  } catch {
    return iso;
  }
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd MMM yyyy");
  } catch {
    return iso;
  }
}

function fmtDuration(minutes?: number | null) {
  if (minutes == null) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hrs = minutes / 60;
  if (hrs < 24) return `${hrs.toFixed(1)} hrs`;
  return `${(hrs / 24).toFixed(1)} days`;
}

export function KpiDrillDownSheet({
  open,
  onOpenChange,
  kind,
  subjectUuid,
  period,
  metricText,
  label,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);

  // Half-open [startTs, endTs) window matching the KPI RPCs.
  const { startTs, endTs } = useMemo(() => {
    const r = getPeriodRange(period);
    const s = `${r.startIso}T00:00:00.000Z`;
    const endDate = new Date(`${r.endIso}T00:00:00.000Z`);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    return { startTs: s, endTs: endDate.toISOString() };
  }, [period]);

  useEffect(() => {
    if (!open || !subjectUuid) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      let data: any[] = [];
      const sb = supabase as any;
      try {
        if (kind === "retention") {
          const { data: rpcRows, error } = await sb.rpc("kpi_csc_retention_rows", {
            p_csc_user_id: subjectUuid,
            p_start: startTs,
            p_end: endTs,
          });
          if (error) throw error;
          data = (rpcRows ?? []).map((r: any) => ({
            id: `${r.tenant_id}:${r.assigned_since}`,
            tenant_id: r.tenant_id,
            tenant_name: r.tenant_name ?? `Tenant #${r.tenant_id}`,
            assigned_since: r.assigned_since,
            // The Retention table renders "Churned" only when ended_at is truthy;
            // pass through churned_at only if the churn occurred in this period.
            ended_at: r.churned_in_period ? r.churned_at : null,
          }));
        } else if (kind === "communication") {
          const { data: rpcRows, error } = await sb.rpc("kpi_csc_communication_rows", {
            p_csc_user_id: subjectUuid,
            p_start: startTs,
            p_end: endTs,
          });
          if (error) throw error;
          data = (rpcRows ?? []).map((r: any) => ({
            id: r.message_id,
            subject: r.subject,
            tenant_name: r.tenant_name ?? "—",
            received_at: r.received_at,
            responded_at: r.responded_at,
            response_minutes: r.response_seconds != null ? r.response_seconds / 60 : null,
            sla_met:
              r.sla_status === "met" ? true : r.sla_status === "missed" ? false : null,
          }));
        } else if (kind === "csc_tasks") {
          const { data: rpcRows, error } = await sb.rpc("kpi_csc_tasks_rows", {
            p_csc_user_id: subjectUuid,
            p_start: startTs,
            p_end: endTs,
          });
          if (error) throw error;
          data = (rpcRows ?? []).map((r: any) => ({
            id: r.task_id,
            title: r.task_name,
            status: r.status,
            created_at: r.created_at,
            completed_at: r.completed_at,
            due_at: null,
            tenant_name: r.tenant_name ?? "—",
            source_ref: r.package_name ?? "—",
            metadata: { package_name: r.package_name ?? "—" },
          }));
        } else if (kind === "assistant_tasks") {
          const sb = supabase as any;
          const [ttCreated, ttFollowers, cai, ops] = await Promise.all([
            sb.from("tasks_tenants")
              .select("id, task_name, status, due_date, completed_at, created_at")
              .gte("created_at", startTs).lte("created_at", endTs)
              .eq("created_by", subjectUuid),
            sb.from("tasks_tenants")
              .select("id, task_name, status, due_date, completed_at, created_at")
              .gte("created_at", startTs).lte("created_at", endTs)
              .contains("followers", [subjectUuid]),
            sb.from("client_action_items")
              .select("id, title, status, due_date, completed_at, created_at")
              .gte("created_at", startTs).lte("created_at", endTs)
              .eq("assignee_user_id", subjectUuid),
            sb.from("ops_work_items")
              .select("id, title, status, due_at, completed_at, created_at")
              .gte("created_at", startTs).lte("created_at", endTs)
              .eq("owner_user_uuid", subjectUuid),
          ]);

          const merged: any[] = [];
          const seenTt = new Set<string>();
          const pushTt = (r: any) => {
            if (seenTt.has(r.id)) return;
            seenTt.add(r.id);
            merged.push({
              id: `tt:${r.id}`,
              title: r.task_name,
              source: "tasks_tenants",
              status: r.status,
              due_at: r.due_date,
              completed_at: r.completed_at,
              created_at: r.created_at,
            });
          };
          (ttCreated.data ?? []).forEach(pushTt);
          (ttFollowers.data ?? []).forEach(pushTt);
          (cai.data ?? []).forEach((r: any) => merged.push({
            id: `cai:${r.id}`,
            title: r.title,
            source: "client_action_items",
            status: r.status,
            due_at: r.due_date,
            completed_at: r.completed_at,
            created_at: r.created_at,
          }));
          (ops.data ?? []).forEach((r: any) => merged.push({
            id: `ops:${r.id}`,
            title: r.title,
            source: "ops_work_items",
            status: r.status,
            due_at: r.due_at,
            completed_at: r.completed_at,
            created_at: r.created_at,
          }));

          merged.sort((a, b) => {
            const av = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
            const bv = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;
            return av - bv;
          });
          data = merged;
        }
      } catch (err) {
        console.error("[KpiDrillDownSheet] failed to load", err);
      }
      if (!cancelled) {
        setRows(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, kind, subjectUuid, startTs, endTs]);

  const periodLabel = KPI_V2_PERIOD_LABEL[period];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader className="space-y-2 pr-6">
          <SheetTitle className="text-lg">
            {label} — {periodLabel}
          </SheetTitle>
          <SheetDescription>{KIND_DESCRIPTION[kind]}</SheetDescription>
          <div className="mt-2 rounded-md border border-border/60 bg-gradient-to-r from-[#7130A0]/5 via-[#ED1878]/5 to-[#23C0DD]/5 px-3 py-2 text-sm font-medium text-foreground">
            {metricText}
          </div>
        </SheetHeader>

        <div className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading records…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground/60" />
              <div className="text-sm font-medium text-foreground">No records</div>
              <div className="text-xs text-muted-foreground max-w-xs">
                Nothing was measured for {periodLabel.toLowerCase()} yet. Records will appear here as they're logged.
              </div>
            </div>
          ) : kind === "retention" ? (
            <RetentionTable rows={rows} />
          ) : kind === "communication" ? (
            <CommunicationTable rows={rows} />
          ) : kind === "csc_tasks" ? (
            <CscTasksTable rows={rows} />
          ) : (
            <AssistantTasksTable rows={rows} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------- Tables ---------------------------------- */

function RetentionTable({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="!px-2">Client</TableHead>
            <TableHead className="!px-2">Assigned since</TableHead>
            <TableHead className="!px-2">Ended at</TableHead>
            <TableHead className="!px-2">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const churned = !!r.ended_at;
            return (
              <TableRow
                key={r.id}
                className={cn(churned && "bg-rose-500/5 hover:bg-rose-500/10")}
              >
                <TableCell className="!px-2 max-w-[200px] truncate font-medium" title={r.tenant_name}>{r.tenant_name}</TableCell>
                <TableCell className="!px-2 text-sm">{fmtDate(r.assigned_since)}</TableCell>
                <TableCell className="!px-2 text-sm">{fmtDate(r.ended_at)}</TableCell>
                <TableCell className="!px-2">
                  {churned ? (
                    <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-rose-700">
                      <X className="mr-1 h-3 w-3" /> Churned {fmtDate(r.ended_at)}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700">
                      <Check className="mr-1 h-3 w-3" /> Active
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function CommunicationTable({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="!px-2">Subject</TableHead>
            <TableHead className="!px-2">Client</TableHead>
            <TableHead className="!px-2">Received</TableHead>
            <TableHead className="!px-2">First reply</TableHead>
            <TableHead className="!px-2">Response</TableHead>
            <TableHead className="!px-2">SLA</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const met = r.sla_met === true;
            const missed = r.sla_met === false;
            return (
              <TableRow key={r.id}>
                <TableCell className="!px-2 max-w-[200px] truncate font-medium" title={r.subject ?? ""}>
                  {r.subject ? (r.subject.length > 40 ? r.subject.slice(0, 40) + "…" : r.subject) : "(no subject)"}
                </TableCell>
                <TableCell className="!px-2 text-sm">{r.tenant_name}</TableCell>
                <TableCell className="!px-2 text-xs text-muted-foreground">{fmtDateTime(r.received_at)}</TableCell>
                <TableCell className="!px-2 text-xs text-muted-foreground">{fmtDateTime(r.responded_at)}</TableCell>
                <TableCell className="!px-2 text-sm">{fmtDuration(r.response_minutes)}</TableCell>
                <TableCell className="!px-2">
                  {met ? (
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700">
                      <Check className="mr-1 h-3 w-3" /> Met
                    </Badge>
                  ) : missed ? (
                    <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-rose-700">
                      <X className="mr-1 h-3 w-3" /> Missed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-border text-muted-foreground">
                      <Minus className="mr-1 h-3 w-3" /> Pending
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function taskStatusTone(status?: string | null, completedAt?: string | null, dueAt?: string | null) {
  const s = (status ?? "").toLowerCase();
  if (completedAt || ["done_on_time", "rectified", "completed", "done"].includes(s)) {
    return "bg-emerald-500/10 text-emerald-700 border-emerald-500/40";
  }
  if (dueAt && new Date(dueAt) < new Date()) {
    return "bg-rose-500/10 text-rose-700 border-rose-500/40";
  }
  return "bg-[#23C0DD]/10 text-[#0e6b7c] border-[#23C0DD]/40";
}

function CscTasksTable({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="!px-2">Task</TableHead>
            <TableHead className="!px-2">Client</TableHead>
            <TableHead className="!px-2">Package</TableHead>
            <TableHead className="!px-2">Status</TableHead>
            <TableHead className="!px-2">Created</TableHead>
            <TableHead className="!px-2">Completed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const pkg =
              (r.metadata && (r.metadata.package_name || r.metadata.package_title || r.metadata.package)) ||
              r.source_ref ||
              "—";
            return (
              <TableRow key={r.id}>
                <TableCell className="!px-2 max-w-[240px] truncate font-medium" title={r.title ?? ""}>
                  {r.title}
                </TableCell>
                <TableCell className="!px-2 text-sm">{r.tenant_name}</TableCell>
                <TableCell className="!px-2 text-xs text-muted-foreground max-w-[160px] truncate" title={String(pkg)}>
                  {pkg}
                </TableCell>
                <TableCell className="!px-2">
                  <Badge variant="outline" className={cn("border", taskStatusTone(r.status, r.completed_at, r.due_at))}>
                    {(r.status ?? "—").replace(/_/g, " ")}
                  </Badge>
                </TableCell>
                <TableCell className="!px-2 text-xs text-muted-foreground">{fmtDate(r.created_at)}</TableCell>
                <TableCell className="!px-2 text-xs text-muted-foreground">{fmtDate(r.completed_at)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function AssistantTasksTable({ rows }: { rows: any[] }) {
  const SOURCE_LABEL: Record<string, string> = {
    client_task: "Client Task",
    action_item: "Action Item",
    ops: "Ops",
    ops_work_item: "Ops",
    tasks_tenants: "Client Task",
    client_action_items: "Action Item",
  };
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="!px-2">Task</TableHead>
            <TableHead className="!px-2">Source</TableHead>
            <TableHead className="!px-2">Due</TableHead>
            <TableHead className="!px-2">Completed</TableHead>
            <TableHead className="!px-2">Result</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const label = SOURCE_LABEL[r.source ?? ""] ?? r.source ?? "—";
            const isDone = !!r.completed_at;
            const onTime =
              isDone && r.due_at ? new Date(r.completed_at) <= new Date(r.due_at) : isDone && !r.due_at;
            return (
              <TableRow key={r.id}>
                <TableCell className="!px-2 max-w-[240px] truncate font-medium" title={r.title ?? ""}>
                  {r.title}
                </TableCell>
                <TableCell className="!px-2">
                  <Badge variant="outline" className="border-[#7130A0]/30 bg-[#7130A0]/5 text-[#7130A0]">
                    {label}
                  </Badge>
                </TableCell>
                <TableCell className="!px-2 text-xs text-muted-foreground">{fmtDate(r.due_at)}</TableCell>
                <TableCell className="!px-2 text-xs text-muted-foreground">{fmtDate(r.completed_at)}</TableCell>
                <TableCell className="!px-2">
                  {!isDone ? (
                    <Badge variant="outline" className="border-border text-muted-foreground">
                      <Minus className="mr-1 h-3 w-3" /> Pending
                    </Badge>
                  ) : onTime ? (
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700">
                      <Check className="mr-1 h-3 w-3" /> On time
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-rose-700">
                      <X className="mr-1 h-3 w-3" /> Late
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
