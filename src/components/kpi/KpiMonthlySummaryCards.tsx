import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

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

const ACCENT: Record<Status, string> = {
  on: "bg-emerald-600",
  risk: "bg-amber-600",
  below: "bg-rose-600",
  none: "bg-muted-foreground/30",
};

function statusBadge(status: Status) {
  if (status === "on")
    return <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 border border-emerald-500/30">On Target</Badge>;
  if (status === "risk")
    return <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 border border-amber-500/30">At Risk</Badge>;
  if (status === "below")
    return <Badge className="bg-rose-500/15 text-rose-700 hover:bg-rose-500/15 border border-rose-500/30">Below Target</Badge>;
  return <Badge variant="secondary">No data</Badge>;
}

function pctStatus(pct: number | null, on: number, risk: number): Status {
  if (pct == null) return "none";
  if (pct >= on) return "on";
  if (pct >= risk) return "risk";
  return "below";
}

function formatMinutes(min: number | null): string {
  if (min == null) return "No data";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m}m`;
}

interface CardSpec {
  label: string;
  actual: string;
  target: string;
  status: Status;
}

function isoSince(period: Period, offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - PERIOD_DAYS[period] * (1 + offset) + (offset > 0 ? PERIOD_DAYS[period] : 0));
  return d.toISOString();
}

function CardGrid({ cards, period, loading }: { cards: CardSpec[]; period: Period; loading: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Monthly summary · {PERIOD_LABEL[period]}
        </h2>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="relative overflow-hidden border shadow-sm">
            <div className={`absolute inset-x-0 top-0 h-1.5 ${ACCENT[c.status]}`} />
            <div className="p-5 pt-6 flex flex-col gap-3 min-h-[140px]">
              <div className="text-[11px] font-semibold tracking-wider text-muted-foreground">
                {c.label}
              </div>
              <div className="text-4xl font-bold leading-none text-foreground">
                {c.actual}
              </div>
              <div className="mt-auto flex items-end justify-between gap-2">
                <span className="text-xs text-muted-foreground">{c.target}</span>
                {statusBadge(c.status)}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function KpiMonthlySummaryCards({ subjectUuid, period, role }: Props) {
  if (role === "csc_consultant") return <CscCards subjectUuid={subjectUuid} period={period} />;
  if (role === "cst_assistant") return <CstCards subjectUuid={subjectUuid} period={period} />;
  return <DevCards subjectUuid={subjectUuid} period={period} />;
}

function CscCards({ subjectUuid, period }: { subjectUuid: string; period: Period }) {
  const [loading, setLoading] = useState(true);
  const [emailPct, setEmailPct] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!subjectUuid) return;
    setLoading(true);
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - PERIOD_DAYS[period]);
      const { data } = await (supabase as any)
        .from("v_kpi_csc_summary")
        .select("email_total,email_sla_met")
        .eq("subject_uuid", subjectUuid)
        .gte("period_start", since.toISOString().slice(0, 10));
      if (cancelled) return;
      const rows = (data ?? []) as Array<{ email_total: number; email_sla_met: number }>;
      const total = rows.reduce((s, r) => s + (r.email_total ?? 0), 0);
      const met = rows.reduce((s, r) => s + (r.email_sla_met ?? 0), 0);
      setEmailPct(total > 0 ? (met / total) * 100 : null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [subjectUuid, period]);

  const cards = useMemo<CardSpec[]>(() => [
    {
      label: "EMAILS ≤ 12 HRS",
      actual: emailPct == null ? "No data" : `${emailPct.toFixed(0)}%`,
      target: "Target: 80%",
      status: pctStatus(emailPct, 80, 72),
    },
    { label: "CLIENT RETENTION", actual: "No data", target: "Target: 90%", status: "none" },
    { label: "STAGE HEALTH", actual: "No data", target: "Target: 100% green", status: "none" },
  ], [emailPct]);

  return <CardGrid cards={cards} period={period} loading={loading} />;
}

function CstCards({ subjectUuid, period }: { subjectUuid: string; period: Period }) {
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
      const { data } = await (supabase as any)
        .from("v_kpi_cst_summary")
        .select("sla1_total,sla1_met,sla2_total,sla2_met,tasks_total,tasks_on_time")
        .eq("subject_uuid", subjectUuid)
        .gte("period_start", since.toISOString().slice(0, 10));
      if (cancelled) return;
      const rows = (data ?? []) as Array<any>;
      const sum = (k: string) => rows.reduce((s, r) => s + (r[k] ?? 0), 0);
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

  const cards = useMemo<CardSpec[]>(() => [
    {
      label: "SLA 1 — EMAILS ≤ 12 HRS",
      actual: sla1 == null ? "No data" : `${sla1.toFixed(0)}%`,
      target: "Target: 90%",
      status: pctStatus(sla1, 90, 80),
    },
    {
      label: "SLA 2 — CLIENT MESSAGES ≤ 12 HRS",
      actual: sla2 == null ? "No data" : `${sla2.toFixed(0)}%`,
      target: "Target: 90%",
      status: pctStatus(sla2, 90, 80),
    },
    {
      label: "TASKS BEFORE DEADLINE",
      actual: tasksPct == null ? "No data" : `${tasksPct.toFixed(0)}%`,
      target: "Target: 80%",
      status: pctStatus(tasksPct, 80, 70),
    },
  ], [sla1, sla2, tasksPct]);

  return <CardGrid cards={cards} period={period} loading={loading} />;
}

function DevCard({ c }: { c: CardSpec }) {
  return (
    <Card className="relative overflow-hidden border shadow-sm">
      <div className={`absolute inset-x-0 top-0 h-1.5 ${ACCENT[c.status]}`} />
      <div className="p-5 pt-6 flex flex-col gap-3 min-h-[140px]">
        <div className="text-[11px] font-semibold tracking-wider text-muted-foreground">
          {c.label}
        </div>
        <div className="text-4xl font-bold leading-none text-foreground">
          {c.actual}
        </div>
        <div className="mt-auto flex items-end justify-between gap-2">
          <span className="text-xs text-muted-foreground">{c.target}</span>
          {statusBadge(c.status)}
        </div>
      </div>
    </Card>
  );
}

function DevCards({ subjectUuid, period }: { subjectUuid: string; period: Period }) {
  const [loading, setLoading] = useState(true);
  const [firstResp, setFirstResp] = useState<{ avg: number | null; allOk: boolean; anyOver: boolean }>({ avg: null, allOk: false, anyOver: false });
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

      // KPI 1: first response weighted avg
      const { data: devRows } = await (supabase as any)
        .from("v_kpi_dev_summary")
        .select("tickets_opened,avg_first_response_minutes")
        .eq("subject_uuid", subjectUuid)
        .gte("period_start", since.toISOString().slice(0, 10));
      const rows = (devRows ?? []) as Array<{ tickets_opened: number; avg_first_response_minutes: number | null }>;
      let wsum = 0, wcount = 0, anyOver = false, allOk = rows.length > 0;
      for (const r of rows) {
        if (r.avg_first_response_minutes == null) continue;
        const w = r.tickets_opened ?? 0;
        if (w <= 0) continue;
        wsum += r.avg_first_response_minutes * w;
        wcount += w;
        if (r.avg_first_response_minutes > 720) anyOver = true;
      }
      const avg = wcount > 0 ? wsum / wcount : null;
      if (rows.length === 0) allOk = false;

      // KPI 2: stalled in_progress
      const { count: stalledCount } = await (supabase as any)
        .from("kpi_tickets")
        .select("id", { count: "exact", head: true })
        .eq("assignee_uuid", subjectUuid)
        .eq("status", "in_progress")
        .lt("opened_at", stallThreshold.toISOString());

      // KPI 4: trend
      const { count: curCount } = await (supabase as any)
        .from("kpi_tickets")
        .select("id", { count: "exact", head: true })
        .eq("assignee_uuid", subjectUuid)
        .gte("opened_at", since.toISOString());
      const { count: priorCount } = await (supabase as any)
        .from("kpi_tickets")
        .select("id", { count: "exact", head: true })
        .eq("assignee_uuid", subjectUuid)
        .gte("opened_at", sincePrior.toISOString())
        .lt("opened_at", since.toISOString());

      // KPI 3: comms compliance
      const { data: ticketRows } = await (supabase as any)
        .from("kpi_tickets")
        .select("id,status,reopen_count")
        .eq("assignee_uuid", subjectUuid)
        .gte("opened_at", since.toISOString());
      const tickets = (ticketRows ?? []) as Array<{ id: string; status: string; reopen_count: number | null }>;
      let commsPctVal: number | null = null;
      if (tickets.length > 0) {
        const ids = tickets.map((t) => t.id);
        const { data: commRows } = await (supabase as any)
          .from("kpi_ticket_comms")
          .select("ticket_id,comm_key")
          .in("ticket_id", ids);
        const byTicket = new Map<string, Set<string>>();
        for (const c of (commRows ?? []) as Array<{ ticket_id: string; comm_key: string }>) {
          if (!byTicket.has(c.ticket_id)) byTicket.set(c.ticket_id, new Set());
          byTicket.get(c.ticket_id)!.add(c.comm_key);
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
      setFirstResp({ avg, allOk: allOk && !anyOver, anyOver });
      setStalled(stalledCount ?? 0);
      setTrend({ current: curCount ?? 0, prior: priorCount ?? 0 });
      setCommsPct(commsPctVal);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [subjectUuid, period]);

  // Group 2: rocks & delivery — always quarterly
  useEffect(() => {
    let cancelled = false;
    if (!subjectUuid) return;
    setDeliveryLoading(true);
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - PERIOD_DAYS.quarterly);
      const { data } = await (supabase as any)
        .from("v_kpi_dev_summary")
        .select("milestones_total,milestones_on_time")
        .eq("subject_uuid", subjectUuid)
        .gte("period_start", since.toISOString().slice(0, 10));
      if (cancelled) return;
      const rows = (data ?? []) as Array<{ milestones_total: number | null; milestones_on_time: number | null }>;
      const total = rows.reduce((s, r) => s + (r.milestones_total ?? 0), 0);
      const onTime = rows.reduce((s, r) => s + (r.milestones_on_time ?? 0), 0);
      setDeliveryTotal(total);
      setDeliveryPct(total > 0 ? (onTime / total) * 100 : null);
      setDeliveryLoading(false);
    })();
    return () => { cancelled = true; };
  }, [subjectUuid]);

  const ticketCards = useMemo<CardSpec[]>(() => {
    const firstStatus: Status = firstResp.avg == null ? "none" : firstResp.anyOver ? "below" : "on";
    const stalledStatus: Status = stalled == null ? "none" : stalled === 0 ? "on" : "below";

    let trendActual = "No data";
    let trendStatus: Status = "none";
    if (trend) {
      if (trend.prior === 0 && trend.current === 0) {
        trendActual = "No change";
        trendStatus = "risk";
      } else if (trend.prior === 0) {
        trendActual = `↑ ${trend.current}`;
        trendStatus = "below";
      } else {
        const change = ((trend.current - trend.prior) / trend.prior) * 100;
        if (Math.abs(change) < 0.5) { trendActual = "No change"; trendStatus = "risk"; }
        else if (change < 0) { trendActual = `↓ ${Math.abs(change).toFixed(0)}%`; trendStatus = "on"; }
        else { trendActual = `↑ ${change.toFixed(0)}%`; trendStatus = "below"; }
      }
    }

    return [
      {
        label: "KPI 1 — FIRST RESPONSE",
        actual: formatMinutes(firstResp.avg),
        target: "Target: ≤ 12 hrs",
        status: firstStatus,
      },
      {
        label: "KPI 2 — IN-PROGRESS STALLED",
        actual: stalled == null ? "No data" : String(stalled),
        target: "Target: 0 stalled",
        status: stalledStatus,
      },
      {
        label: "KPI 3 — COMMS COMPLIANCE",
        actual: commsPct == null ? "No data" : `${commsPct.toFixed(0)}%`,
        target: "Target: 100%",
        status: pctStatus(commsPct, 100, 80),
      },
      {
        label: "KPI 4 — TICKET VOLUME TREND",
        actual: trendActual,
        target: "Target: month-on-month decrease",
        status: trendStatus,
      },
    ];
  }, [firstResp, stalled, trend, commsPct]);

  const deliveryCard = useMemo<CardSpec>(() => ({
    label: "KPI 5 & 6 — ROCKS & DELIVERY",
    actual: deliveryTotal === 0 || deliveryPct == null ? "No data" : `${deliveryPct.toFixed(0)}%`,
    target: "Target: 100% on time",
    status: deliveryTotal === 0 ? "none" : pctStatus(deliveryPct, 100, 80),
  }), [deliveryPct, deliveryTotal]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Ticket performance · {PERIOD_LABEL[period]}</h2>
          {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {ticketCards.map((c) => <DevCard key={c.label} c={c} />)}
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Rocks & delivery · This quarter</h2>
          {deliveryLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="max-w-sm">
          <DevCard c={deliveryCard} />
        </div>
      </div>
    </div>
  );
}
