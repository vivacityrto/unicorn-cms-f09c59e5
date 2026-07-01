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

  const range = useMemo(() => getPeriodRange(period), [period]);
  const startTs = `${range.startIso}T00:00:00.000Z`;
  const endTs = `${range.endIso}T23:59:59.999Z`;

  useEffect(() => {
    if (!open || !subjectUuid) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      let data: any[] = [];
      try {
        if (kind === "retention") {
          const { data: aRows } = await (supabase as any)
            .from("tenant_csc_assignments")
            .select("id, tenant_id, assigned_since, ended_at, is_primary")
            .eq("csc_user_id", subjectUuid)
            .eq("is_primary", true)
            .or(
              `and(assigned_since.lte.${endTs},ended_at.is.null),and(assigned_since.lte.${endTs},ended_at.gte.${startTs})`
            )
            .order("assigned_since", { ascending: false });
          const tenantIds = Array.from(
            new Set((aRows ?? []).map((r: any) => r.tenant_id).filter(Boolean))
          );
          const nameMap: Record<number, string> = {};
          if (tenantIds.length) {
            const { data: tRows } = await (supabase as any)
              .from("tenants")
              .select("tenant_id, name")
              .in("tenant_id", tenantIds);
            (tRows ?? []).forEach((t: any) => {
              nameMap[t.tenant_id] = t.name;
            });
          }
          data = (aRows ?? []).map((r: any) => ({
            ...r,
            tenant_name: nameMap[r.tenant_id] ?? `Tenant #${r.tenant_id}`,
          }));
        } else if (kind === "communication") {
          const { data: eRows } = await (supabase as any)
            .from("kpi_email_log")
            .select(
              "id, tenant_id, subject, received_at, responded_at, response_minutes, sla_met, email_type, conversation_id"
            )
            .eq("user_uuid", subjectUuid)
            .gte("received_at", startTs)
            .lte("received_at", endTs)
            .order("received_at", { ascending: false });
          const tenantIds = Array.from(
            new Set((eRows ?? []).map((r: any) => r.tenant_id).filter(Boolean))
          );
          const nameMap: Record<number, string> = {};
          if (tenantIds.length) {
            const { data: tRows } = await (supabase as any)
              .from("tenants")
              .select("tenant_id, name")
              .in("tenant_id", tenantIds);
            (tRows ?? []).forEach((t: any) => {
              nameMap[t.tenant_id] = t.name;
            });
          }
          data = (eRows ?? []).map((r: any) => ({
            ...r,
            tenant_name: r.tenant_id ? nameMap[r.tenant_id] ?? "—" : "—",
          }));
        } else if (kind === "csc_tasks" || kind === "assistant_tasks") {
          // kpi_tasks: created OR completed within the period window
          const { data: tRows } = await (supabase as any)
            .from("kpi_tasks")
            .select(
              "id, title, tenant_id, source, source_ref, status, due_at, completed_at, created_at, metadata"
            )
            .eq("assignee_uuid", subjectUuid)
            .or(
              `and(created_at.gte.${startTs},created_at.lte.${endTs}),and(completed_at.gte.${startTs},completed_at.lte.${endTs})`
            )
            .order(kind === "assistant_tasks" ? "due_at" : "created_at", {
              ascending: kind === "assistant_tasks",
              nullsFirst: false,
            });
          const tenantIds = Array.from(
            new Set((tRows ?? []).map((r: any) => r.tenant_id).filter(Boolean))
          );
          const nameMap: Record<number, string> = {};
          if (tenantIds.length) {
            const { data: nRows } = await (supabase as any)
              .from("tenants")
              .select("tenant_id, name")
              .in("tenant_id", tenantIds);
            (nRows ?? []).forEach((t: any) => {
              nameMap[t.tenant_id] = t.name;
            });
          }
          data = (tRows ?? []).map((r: any) => ({
            ...r,
            tenant_name: r.tenant_id ? nameMap[r.tenant_id] ?? "—" : "—",
          }));
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Client</TableHead>
          <TableHead>Assigned since</TableHead>
          <TableHead>Ended at</TableHead>
          <TableHead>Status</TableHead>
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
              <TableCell className="font-medium">{r.tenant_name}</TableCell>
              <TableCell className="text-sm">{fmtDate(r.assigned_since)}</TableCell>
              <TableCell className="text-sm">{fmtDate(r.ended_at)}</TableCell>
              <TableCell>
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
  );
}

function CommunicationTable({ rows }: { rows: any[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Topic</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>Received</TableHead>
          <TableHead>First reply</TableHead>
          <TableHead>Response</TableHead>
          <TableHead>SLA</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const met = r.sla_met === true;
          const missed = r.sla_met === false;
          return (
            <TableRow key={r.id}>
              <TableCell className="max-w-[220px] truncate font-medium" title={r.subject ?? ""}>
                {r.subject || "(no subject)"}
              </TableCell>
              <TableCell className="text-sm">{r.tenant_name}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{fmtDateTime(r.received_at)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{fmtDateTime(r.responded_at)}</TableCell>
              <TableCell className="text-sm">{fmtDuration(r.response_minutes)}</TableCell>
              <TableCell>
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Task</TableHead>
          <TableHead>Client</TableHead>
          <TableHead>Package</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Completed</TableHead>
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
              <TableCell className="max-w-[240px] truncate font-medium" title={r.title ?? ""}>
                {r.title}
              </TableCell>
              <TableCell className="text-sm">{r.tenant_name}</TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate" title={String(pkg)}>
                {pkg}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={cn("border", taskStatusTone(r.status, r.completed_at, r.due_at))}>
                  {(r.status ?? "—").replace(/_/g, " ")}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{fmtDate(r.created_at)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{fmtDate(r.completed_at)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Task</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Due</TableHead>
          <TableHead>Completed</TableHead>
          <TableHead>Result</TableHead>
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
              <TableCell className="max-w-[240px] truncate font-medium" title={r.title ?? ""}>
                {r.title}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="border-[#7130A0]/30 bg-[#7130A0]/5 text-[#7130A0]">
                  {label}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{fmtDate(r.due_at)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{fmtDate(r.completed_at)}</TableCell>
              <TableCell>
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
  );
}
