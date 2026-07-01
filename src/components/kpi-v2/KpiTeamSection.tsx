import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Users, Code2, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { KPI_V2_PERIOD_LABEL, type KpiV2Period } from "./types";
import { pctStatus, retentionStatus, type KpiStatus } from "@/lib/kpi-v2/status";
import {
  fetchRetention, fetchCommunication, fetchCscTasks, fetchAssistantTasks,
} from "@/lib/kpi-v2/fetchers";
import { KpiDrillDownSheet, type KpiDrillDownKind } from "./KpiDrillDownSheet";

interface Staff {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  kpi_role: string | null;
}

interface Props {
  period: KpiV2Period;
}

const STATUS_LABEL: Record<KpiStatus, string> = {
  on: "On Target",
  risk: "At Risk",
  below: "Below Target",
  none: "No Data",
};

function StatusChip({ status }: { status: KpiStatus }) {
  const cls =
    status === "on"
      ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-200"
      : status === "risk"
      ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200"
      : status === "below"
      ? "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/30 dark:text-rose-200"
      : "bg-muted text-muted-foreground border-border";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold", cls)}>
      <span
        className={cn(
          "mr-1 inline-block h-1.5 w-1.5 rounded-full",
          status === "on" && "bg-emerald-500",
          status === "risk" && "bg-amber-500",
          status === "below" && "bg-rose-500",
          status === "none" && "bg-muted-foreground/50",
        )}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

function fullName(s: Staff) {
  return [s.first_name, s.last_name].filter(Boolean).join(" ") || "—";
}
function initials(s: Staff) {
  return `${(s.first_name ?? "").slice(0, 1)}${(s.last_name ?? "").slice(0, 1)}`.toUpperCase() || "?";
}

function StaffCell({ s }: { s: Staff }) {
  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <Avatar className="h-8 w-8">
        {s.avatar_url ? <AvatarImage src={s.avatar_url} alt={fullName(s)} /> : null}
        <AvatarFallback className="text-xs">{initials(s)}</AvatarFallback>
      </Avatar>
      <span className="font-medium text-sm truncate">{fullName(s)}</span>
    </div>
  );
}

function MetricCell({
  pct,
  status,
  loading,
  onClick,
}: {
  pct: number | null;
  status: KpiStatus;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group inline-flex flex-col items-start gap-1 rounded-md px-2 py-1 -mx-2 -my-1 text-left transition-colors",
        "hover:bg-brand-light-purple-100 dark:hover:bg-brand-acai-800",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7130A0]/40",
      )}
      aria-label="View details"
    >
      <span className="text-sm font-semibold text-foreground tabular-nums">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : pct == null ? "—" : `${pct.toFixed(0)}%`}
      </span>
      <StatusChip status={status} />
    </button>
  );
}

// ---------------- CSC row ----------------
function CscRow({
  staff,
  period,
  onDrill,
}: {
  staff: Staff;
  period: KpiV2Period;
  onDrill: (kind: KpiDrillDownKind, metricText: string, label: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [ret, setRet] = useState<{ pct: number | null; total: number; churned: number }>({ pct: null, total: 0, churned: 0 });
  const [com, setCom] = useState<{ pct: number | null; total: number; met: number }>({ pct: null, total: 0, met: 0 });
  const [tsk, setTsk] = useState<{ pct: number | null; total: number; completed: number }>({ pct: null, total: 0, completed: 0 });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchRetention(staff.user_uuid, period),
      fetchCommunication(staff.user_uuid, period),
      fetchCscTasks(staff.user_uuid, period),
    ]).then(([r, c, t]) => {
      if (cancelled) return;
      setRet({ pct: r.pct, total: r.total, churned: r.churned });
      setCom({ pct: c.pct, total: c.total, met: c.met });
      setTsk({ pct: t.pct, total: t.total, completed: t.completed });
      setLoading(false);
    }).catch(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [staff.user_uuid, period]);

  const name = fullName(staff);
  const periodLabel = KPI_V2_PERIOD_LABEL[period];

  const retText = ret.total > 0
    ? `${ret.pct?.toFixed(0)}% · ${ret.total - ret.churned} of ${ret.total} clients retained (${ret.churned} churned)`
    : "No client assignments in this period.";
  const comText = com.total > 0
    ? `${com.pct?.toFixed(0)}% · ${com.met} of ${com.total} messages replied within 12 hrs`
    : "No client messages recorded for this period.";
  const tskText = tsk.total > 0
    ? `${tsk.pct?.toFixed(0)}% · ${tsk.completed} of ${tsk.total} package tasks completed`
    : "No package tasks recorded for this period.";

  return (
    <TableRow>
      <TableCell><StaffCell s={staff} /></TableCell>
      <TableCell>
        <MetricCell
          pct={ret.pct} status={retentionStatus(ret.pct)} loading={loading}
          onClick={() => onDrill("retention", `${name} — Retention — ${periodLabel} · ${retText}`, "Retention")}
        />
      </TableCell>
      <TableCell>
        <MetricCell
          pct={com.pct} status={pctStatus(com.pct, 80, 72)} loading={loading}
          onClick={() => onDrill("communication", `${name} — Communication — ${periodLabel} · ${comText}`, "Communication")}
        />
      </TableCell>
      <TableCell>
        <MetricCell
          pct={tsk.pct} status={pctStatus(tsk.pct, 90, 80)} loading={loading}
          onClick={() => onDrill("csc_tasks", `${name} — Tasks — ${periodLabel} · ${tskText}`, "Tasks")}
        />
      </TableCell>
    </TableRow>
  );
}

// ---------------- Assistant row ----------------
function AssistantRow({
  staff,
  period,
  onDrill,
}: {
  staff: Staff;
  period: KpiV2Period;
  onDrill: (kind: KpiDrillDownKind, metricText: string, label: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [tsk, setTsk] = useState<{ pct: number | null; total: number; completed: number }>({ pct: null, total: 0, completed: 0 });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAssistantTasks(staff.user_uuid, period)
      .then((t) => {
        if (cancelled) return;
        setTsk({ pct: t.pct, total: t.total, completed: t.completed });
        setLoading(false);
      })
      .catch(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [staff.user_uuid, period]);

  const name = fullName(staff);
  const periodLabel = KPI_V2_PERIOD_LABEL[period];
  const tskText = tsk.total > 0
    ? `${tsk.pct?.toFixed(0)}% · ${tsk.completed} of ${tsk.total} tasks completed on time`
    : "No tasks recorded for this period.";

  return (
    <TableRow>
      <TableCell><StaffCell s={staff} /></TableCell>
      <TableCell>
        <MetricCell
          pct={tsk.pct} status={pctStatus(tsk.pct, 85, 75)} loading={loading}
          onClick={() => onDrill("assistant_tasks", `${name} — Task Completion — ${periodLabel} · ${tskText}`, "Task Completion")}
        />
      </TableCell>
    </TableRow>
  );
}

// ---------------- Main ----------------
export function KpiTeamSection({ period }: Props) {
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [drill, setDrill] = useState<
    | { kind: KpiDrillDownKind; subjectUuid: string; metricText: string; label: string }
    | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const sb = supabase as any;
      const { data: dir } = await sb.rpc("get_vivacity_team_directory");
      const uuids = (dir ?? []).map((r: any) => r.user_uuid).filter(Boolean);
      if (uuids.length === 0) {
        if (!cancelled) { setStaff([]); setLoading(false); }
        return;
      }
      const { data: profiles } = await sb
        .from("users")
        .select("user_uuid, kpi_role, kpi_pod")
        .in("user_uuid", uuids);
      const byUuid = new Map<string, { kpi_role: string | null; kpi_pod: string | null }>();
      (profiles ?? []).forEach((p: any) => byUuid.set(p.user_uuid, { kpi_role: p.kpi_role, kpi_pod: p.kpi_pod }));

      const merged: Staff[] = (dir ?? [])
        .map((r: any) => {
          const meta = byUuid.get(r.user_uuid) ?? { kpi_role: null, kpi_pod: null };
          return { ...r, kpi_role: meta.kpi_role, kpi_pod: meta.kpi_pod } as Staff & { kpi_pod: string | null };
        })
        .filter((s: any) => s.kpi_pod !== "qa");

      if (cancelled) return;
      setStaff(merged);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const cscs = useMemo(() => staff.filter((s) => s.kpi_role === "csc_consultant"), [staff]);
  const assistants = useMemo(() => staff.filter((s) => s.kpi_role === "cst_assistant"), [staff]);
  const developers = useMemo(() => staff.filter((s) => s.kpi_role === "developer"), [staff]);

  const openDrill = (subjectUuid: string) =>
    (kind: KpiDrillDownKind, metricText: string, label: string) =>
      setDrill({ kind, subjectUuid, metricText, label });

  return (
    <div className="space-y-6">
      {/* CSC Consultants */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-binate">
            <Users className="h-4 w-4 text-[#7130A0]" /> CSC Consultants
          </CardTitle>
          <CardDescription>Retention, communication and task performance for {KPI_V2_PERIOD_LABEL[period]}.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading team…
            </div>
          ) : cscs.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No CSC consultants configured.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Retention</TableHead>
                  <TableHead>Communication</TableHead>
                  <TableHead>Tasks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cscs.map((s) => (
                  <CscRow key={s.user_uuid} staff={s} period={period} onDrill={openDrill(s.user_uuid)} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Administration Assistants */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-binate">
            <ClipboardList className="h-4 w-4 text-[#ED1878]" /> Administration Assistants
          </CardTitle>
          <CardDescription>Task completion for {KPI_V2_PERIOD_LABEL[period]}.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading team…
            </div>
          ) : assistants.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No administration assistants configured.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Task Completion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assistants.map((s) => (
                  <AssistantRow key={s.user_uuid} staff={s} period={period} onDrill={openDrill(s.user_uuid)} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Developers */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-binate">
            <Code2 className="h-4 w-4 text-[#23C0DD]" /> Developers
          </CardTitle>
          <CardDescription>
            {developers.length > 0
              ? `${developers.length} developer${developers.length === 1 ? "" : "s"} on the team.`
              : "No developers configured."}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="rounded-md border border-dashed border-border/60 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            Developer KPI metrics are coming soon.
          </div>
        </CardContent>
      </Card>

      {drill && (
        <KpiDrillDownSheet
          open={!!drill}
          onOpenChange={(o) => !o && setDrill(null)}
          kind={drill.kind}
          subjectUuid={drill.subjectUuid}
          period={period}
          metricText={drill.metricText}
          label={drill.label}
        />
      )}
    </div>
  );
}
