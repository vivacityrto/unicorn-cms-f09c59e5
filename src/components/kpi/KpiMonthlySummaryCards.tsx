import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2, Mail, MessageSquare, ListChecks, Clock, AlertTriangle, ShieldCheck, TrendingDown, Target } from "lucide-react";

type Period = "weekly" | "monthly" | "quarterly";
type Role = "csc_consultant" | "cst_assistant" | "developer";

interface Props {
  subjectUuid: string;
  period: Period;
  role: Role;
}

const PERIOD_LABEL: Record<Period, string> = {
  weekly: "This week",
  monthly: "This month",
  quarterly: "This quarter",
};

const PERIOD_DAYS: Record<Period, number> = {
  weekly: 7,
  monthly: 30,
  quarterly: 92,
};

type Status = "on" | "risk" | "below" | "none";

const STATUS_HEX: Record<Status, string> = {
  on: "#10b981",
  risk: "#f59e0b",
  below: "#ef4444",
  none: "#94a3b8",
};

const STATUS_LABEL: Record<Status, string> = {
  on: "On target",
  risk: "At risk",
  below: "Below",
  none: "No data",
};

function pctStatus(pct: number | null, on: number, risk: number): Status {
  if (pct == null) return "none";
  if (pct >= on) return "on";
  if (pct >= risk) return "risk";
  return "below";
}

function formatMinutes(min: number | null): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m}m`;
}

interface Metric {
  key: string;
  label: string;
  value: string;
  target: string;
  status: Status;
  pct?: number | null;    // 0-100 for ring; undefined = no ring, show only status dot
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

/* ---------- Presentational ---------- */

function StatusDot({ status }: { status: Status }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ background: STATUS_HEX[status] }}
    />
  );
}

function ProgressRing({ pct, status, size = 44 }: { pct: number; status: Status; size?: number }) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c - (clamped / 100) * c;
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="hsl(var(--muted))"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={STATUS_HEX[status]}
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function MetricTile({ m }: { m: Metric }) {
  const Icon = m.icon;
  const hasRing = typeof m.pct === "number";
  return (
    <div className="group relative flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 shadow-sm transition hover:shadow-md">
      <div
        className="absolute inset-y-2 left-0 w-[3px] rounded-r-full"
        style={{ background: STATUS_HEX[m.status] }}
      />
      {hasRing ? (
        <div className="relative">
          <ProgressRing pct={m.pct as number} status={m.status} />
          <Icon
            className="absolute inset-0 m-auto h-4 w-4"
            style={{ color: STATUS_HEX[m.status] }}
          />
        </div>
      ) : (
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full"
          style={{ background: `${STATUS_HEX[m.status]}1a`, color: STATUS_HEX[m.status] }}
        >
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold leading-none tracking-tight">{m.value}</span>
          <span className="text-[10px] font-medium text-muted-foreground truncate">{m.target}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <StatusDot status={m.status} />
          <span className="uppercase tracking-wide font-medium truncate">{m.label}</span>
        </div>
      </div>
    </div>
  );
}

function SummaryFrame({
  title,
  period,
  loading,
  columns,
  children,
}: {
  title: string;
  period: Period;
  loading: boolean;
  columns: number;
  children: React.ReactNode;
}) {
  const gridCols =
    columns === 4
      ? "sm:grid-cols-2 lg:grid-cols-4"
      : columns === 3
      ? "sm:grid-cols-2 lg:grid-cols-3"
      : "sm:grid-cols-2";
  return (
    <Card className="border shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="h-4 w-1 rounded-full bg-[#23C0DD]" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">{title}</h2>
          <span className="text-[11px] text-muted-foreground">· {PERIOD_LABEL[period]}</span>
        </div>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      <div className={`grid grid-cols-1 ${gridCols} gap-2 p-3`}>{children}</div>
    </Card>
  );
}

/* ---------- Router ---------- */

export function KpiMonthlySummaryCards({ subjectUuid, period, role }: Props) {
  if (role === "csc_consultant") return <CscSummary subjectUuid={subjectUuid} period={period} />;
  if (role === "cst_assistant") return <CstSummary subjectUuid={subjectUuid} period={period} />;
  return <DevSummary subjectUuid={subjectUuid} period={period} />;
}

/* ---------- CSC ---------- */

function CscSummary({ subjectUuid, period }: { subjectUuid: string; period: Period }) {
  const [loading, setLoading] = useState(true);
  const [emailPct, setEmailPct] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!subjectUuid) return;
    setLoading(true);
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - PERIOD_DAYS[period]);
      const { data } = await supabase
        .from("v_kpi_csc_summary")
        .select("email_total,email_sla_met")
        .eq("subject_uuid", subjectUuid)
        .gte("period_start", since.toISOString().slice(0, 10));
      if (cancelled) return;
      const rows = data ?? [];
      const total = rows.reduce((s, r) => s + (r.email_total ?? 0), 0);
      const met = rows.reduce((s, r) => s + (r.email_sla_met ?? 0), 0);
      setEmailPct(total > 0 ? (met / total) * 100 : null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [subjectUuid, period]);

  const metrics = useMemo<Metric[]>(() => [
    {
      key: "emails",
      label: "Emails ≤ 12 hrs",
      value: emailPct == null ? "—" : `${emailPct.toFixed(0)}%`,
      target: "of 80% target",
      status: pctStatus(emailPct, 80, 72),
      pct: emailPct,
      icon: Mail,
    },
    {
      key: "retention",
      label: "Client retention",
      value: "—",
      target: "of 90% target",
      status: "none",
      icon: ShieldCheck,
    },
    {
      key: "stage",
      label: "Stage health",
      value: "—",
      target: "100% green",
      status: "none",
      icon: Target,
    },
  ], [emailPct]);

  return (
    <SummaryFrame title="Consultant KPIs" period={period} loading={loading} columns={3}>
      {metrics.map((m) => <MetricTile key={m.key} m={m} />)}
    </SummaryFrame>
  );
}

/* ---------- CST ---------- */

function CstSummary({ subjectUuid, period }: { subjectUuid: string; period: Period }) {
  const [loading, setLoading] = useState(true);
  const [sla1, setSla1] = useState<number | null>(null);
  const [sla2, setSla2] = useState<number | null>(null);
  const [tasksPct, setTasksPct] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!subjectUuid) return;
    setLoading(true);
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - PERIOD_DAYS[period]);
      const { data } = await supabase
        .from("v_kpi_cst_summary")
        .select("sla1_total,sla1_met,sla2_total,sla2_met,tasks_total,tasks_on_time")
        .eq("subject_uuid", subjectUuid)
        .gte("period_start", since.toISOString().slice(0, 10));
      if (cancelled) return;
      const rows = data ?? [];
      const sum = (k: keyof NonNullable<typeof data>[number]) => rows.reduce((s, r) => s + (r[k] ?? 0), 0);
      const s1t = sum("sla1_total"), s1m = sum("sla1_met");
      const s2t = sum("sla2_total"), s2m = sum("sla2_met");
      const tt = sum("tasks_total"), tot = sum("tasks_on_time");
      setSla1(s1t > 0 ? (s1m / s1t) * 100 : null);
      setSla2(s2t > 0 ? (s2m / s2t) * 100 : null);
      setTasksPct(tt > 0 ? (tot / tt) * 100 : null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [subjectUuid, period]);

  const metrics = useMemo<Metric[]>(() => [
    {
      key: "sla1",
      label: "Emails ≤ 12 hrs",
      value: sla1 == null ? "—" : `${sla1.toFixed(0)}%`,
      target: "of 90% target",
      status: pctStatus(sla1, 90, 80),
      pct: sla1,
      icon: Mail,
    },
    {
      key: "sla2",
      label: "Client msgs ≤ 12 hrs",
      value: sla2 == null ? "—" : `${sla2.toFixed(0)}%`,
      target: "of 90% target",
      status: pctStatus(sla2, 90, 80),
      pct: sla2,
      icon: MessageSquare,
    },
    {
      key: "tasks",
      label: "Tasks on deadline",
      value: tasksPct == null ? "—" : `${tasksPct.toFixed(0)}%`,
      target: "of 80% target",
      status: pctStatus(tasksPct, 80, 70),
      pct: tasksPct,
      icon: ListChecks,
    },
  ], [sla1, sla2, tasksPct]);

  return (
    <SummaryFrame title="Assistant KPIs" period={period} loading={loading} columns={3}>
      {metrics.map((m) => <MetricTile key={m.key} m={m} />)}
    </SummaryFrame>
  );
}

/* ---------- Developer ---------- */

function DevSummary({ subjectUuid, period }: { subjectUuid: string; period: Period }) {
  const [loading, setLoading] = useState(true);
  const [firstResp, setFirstResp] = useState<{ avg: number | null; anyOver: boolean }>({ avg: null, anyOver: false });
  const [stalled, setStalled] = useState<number | null>(null);
  const [trend, setTrend] = useState<{ current: number; prior: number } | null>(null);
  const [commsPct, setCommsPct] = useState<number | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(true);
  const [deliveryPct, setDeliveryPct] = useState<number | null>(null);
  const [deliveryTotal, setDeliveryTotal] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    if (!subjectUuid) return;
    setLoading(true);
    (async () => {
      const days = PERIOD_DAYS[period];
      const since = new Date(); since.setDate(since.getDate() - days);
      const sincePrior = new Date(); sincePrior.setDate(sincePrior.getDate() - 2 * days);
      const stallThreshold = new Date(); stallThreshold.setDate(stallThreshold.getDate() - 2);

      const { data: devRows } = await supabase
        .from("v_kpi_dev_summary")
        .select("tickets_opened,avg_first_response_minutes")
        .eq("subject_uuid", subjectUuid)
        .gte("period_start", since.toISOString().slice(0, 10));
      const rows = devRows ?? [];
      let wsum = 0, wcount = 0, anyOver = false;
      for (const r of rows) {
        if (r.avg_first_response_minutes == null) continue;
        const w = r.tickets_opened ?? 0;
        if (w <= 0) continue;
        wsum += r.avg_first_response_minutes * w;
        wcount += w;
        if (r.avg_first_response_minutes > 720) anyOver = true;
      }
      const avg = wcount > 0 ? wsum / wcount : null;

      const { count: stalledCount } = await supabase
        .from("kpi_tickets")
        .select("id", { count: "exact", head: true })
        .eq("assignee_uuid", subjectUuid)
        .eq("status", "in_progress")
        .lt("opened_at", stallThreshold.toISOString());

      const { count: curCount } = await supabase
        .from("kpi_tickets")
        .select("id", { count: "exact", head: true })
        .eq("assignee_uuid", subjectUuid)
        .gte("opened_at", since.toISOString());
      const { count: priorCount } = await supabase
        .from("kpi_tickets")
        .select("id", { count: "exact", head: true })
        .eq("assignee_uuid", subjectUuid)
        .gte("opened_at", sincePrior.toISOString())
        .lt("opened_at", since.toISOString());

      const { data: ticketRows } = await supabase
        .from("kpi_tickets")
        .select("id,status,reopen_count")
        .eq("assignee_uuid", subjectUuid)
        .gte("opened_at", since.toISOString());
      const tickets = ticketRows ?? [];
      let commsPctVal: number | null = null;
      if (tickets.length > 0) {
        const ids = tickets.map((t) => t.id);
        // NOTE: this previously selected a nonexistent `comm_key` column (the real
        // column is `comm_type`, as written by KpiDeveloperTicketQueue.tsx) — the
        // failed select was silently swallowed (no error check), so `commRows` was
        // always empty and this metric always showed as fully non-compliant.
        const { data: commRows } = await supabase
          .from("kpi_ticket_comms")
          .select("ticket_id,comm_type")
          .in("ticket_id", ids);
        const byTicket = new Map<number, Set<string>>();
        for (const c of commRows ?? []) {
          if (!byTicket.has(c.ticket_id)) byTicket.set(c.ticket_id, new Set());
          byTicket.get(c.ticket_id)!.add(c.comm_type);
        }
        let compliant = 0;
        for (const t of tickets) {
          const required = new Set<string>(["received_ack", "in_progress_notify"]);
          if ((t.reopen_count ?? 0) > 0) required.add("reopened_notify");
          if (t.status === "solved") required.add("resolved_notify");
          const logged = byTicket.get(t.id) ?? new Set<string>();
          let ok = true;
          for (const k of required) if (!logged.has(k)) { ok = false; break; }
          if (ok) compliant++;
        }
        commsPctVal = (compliant / tickets.length) * 100;
      }

      if (cancelled) return;
      setFirstResp({ avg, anyOver });
      setStalled(stalledCount ?? 0);
      setTrend({ current: curCount ?? 0, prior: priorCount ?? 0 });
      setCommsPct(commsPctVal);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [subjectUuid, period]);

  useEffect(() => {
    let cancelled = false;
    if (!subjectUuid) return;
    setDeliveryLoading(true);
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - PERIOD_DAYS.quarterly);
      const { data } = await supabase
        .from("v_kpi_dev_summary")
        .select("milestones_total,milestones_on_time")
        .eq("subject_uuid", subjectUuid)
        .gte("period_start", since.toISOString().slice(0, 10));
      if (cancelled) return;
      const rows = data ?? [];
      const total = rows.reduce((s, r) => s + (r.milestones_total ?? 0), 0);
      const onTime = rows.reduce((s, r) => s + (r.milestones_on_time ?? 0), 0);
      setDeliveryTotal(total);
      setDeliveryPct(total > 0 ? (onTime / total) * 100 : null);
      setDeliveryLoading(false);
    })();
    return () => { cancelled = true; };
  }, [subjectUuid]);

  const ticketMetrics = useMemo<Metric[]>(() => {
    const firstStatus: Status = firstResp.avg == null ? "none" : firstResp.anyOver ? "below" : "on";
    const stalledStatus: Status = stalled == null ? "none" : stalled === 0 ? "on" : "below";

    let trendValue = "—";
    let trendTarget = "vs prior period";
    let trendStatus: Status = "none";
    if (trend) {
      if (trend.prior === 0 && trend.current === 0) {
        trendValue = "0"; trendTarget = "no tickets"; trendStatus = "risk";
      } else if (trend.prior === 0) {
        trendValue = `↑ ${trend.current}`; trendTarget = "new baseline"; trendStatus = "below";
      } else {
        const change = ((trend.current - trend.prior) / trend.prior) * 100;
        if (Math.abs(change) < 0.5) { trendValue = "—"; trendTarget = "no change"; trendStatus = "risk"; }
        else if (change < 0) { trendValue = `↓ ${Math.abs(change).toFixed(0)}%`; trendTarget = "improving"; trendStatus = "on"; }
        else { trendValue = `↑ ${change.toFixed(0)}%`; trendTarget = "worsening"; trendStatus = "below"; }
      }
    }

    return [
      {
        key: "first",
        label: "First response",
        value: formatMinutes(firstResp.avg),
        target: "≤ 12 hrs",
        status: firstStatus,
        icon: Clock,
      },
      {
        key: "stalled",
        label: "Stalled in-progress",
        value: stalled == null ? "—" : String(stalled),
        target: "target: 0",
        status: stalledStatus,
        icon: AlertTriangle,
      },
      {
        key: "comms",
        label: "Comms compliance",
        value: commsPct == null ? "—" : `${commsPct.toFixed(0)}%`,
        target: "of 100% target",
        status: pctStatus(commsPct, 100, 80),
        pct: commsPct,
        icon: ShieldCheck,
      },
      {
        key: "trend",
        label: "Ticket volume",
        value: trendValue,
        target: trendTarget,
        status: trendStatus,
        icon: TrendingDown,
      },
    ];
  }, [firstResp, stalled, trend, commsPct]);

  const deliveryMetric = useMemo<Metric>(() => ({
    key: "delivery",
    label: "Rocks & delivery",
    value: deliveryTotal === 0 || deliveryPct == null ? "—" : `${deliveryPct.toFixed(0)}%`,
    target: "on-time · 100% target",
    status: deliveryTotal === 0 ? "none" : pctStatus(deliveryPct, 100, 80),
    pct: deliveryPct,
    icon: Target,
  }), [deliveryPct, deliveryTotal]);

  return (
    <div className="space-y-3">
      <SummaryFrame title="Ticket performance" period={period} loading={loading} columns={4}>
        {ticketMetrics.map((m) => <MetricTile key={m.key} m={m} />)}
      </SummaryFrame>
      <SummaryFrame title="Rocks & delivery" period="quarterly" loading={deliveryLoading} columns={2}>
        <MetricTile m={deliveryMetric} />
        <div className="rounded-xl border border-dashed bg-muted/20 px-3 py-2.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Target className="h-4 w-4 text-[#23C0DD]" />
          <span>On-time milestone delivery across active rocks this quarter.</span>
        </div>
      </SummaryFrame>
    </div>
  );
}
