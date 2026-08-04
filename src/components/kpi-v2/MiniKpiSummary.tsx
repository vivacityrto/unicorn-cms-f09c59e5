import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Users, CheckSquare, ChevronRight } from "lucide-react";
import { fetchRetention, fetchCommunication, fetchCscTasks } from "@/lib/kpi-v2/fetchers";
import { getPeriodRange, type KpiV2Period } from "./types";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  pct: number | null;
  target: number;
  detail: string;
};

function statusColor(pct: number | null, target: number, warn: number) {
  if (pct == null) return "#94a3b8";
  if (pct >= target) return "#10b981"; // green
  if (pct >= warn) return "#f59e0b"; // amber
  return "#ED1878"; // fuchsia = below
}

function MiniRow({ row }: { row: Row }) {
  const warn = row.target - 10;
  const color = statusColor(row.pct, row.target, warn);
  const pctLabel = row.pct == null ? "—" : `${Math.round(row.pct)}%`;
  const width = row.pct == null ? 0 : Math.min(100, Math.max(4, row.pct));
  const Icon = row.icon;
  return (
    <div className="group rounded-lg border border-border bg-card hover:border-[#23C0DD]/40 transition-colors px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-md shrink-0"
          style={{ backgroundColor: `${color}1a`, color }}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80 truncate">
              {row.label}
            </div>
            <div className="text-sm font-bold tabular-nums" style={{ color }}>
              {pctLabel}
            </div>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${width}%`, backgroundColor: color }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
            <span className="truncate">{row.detail}</span>
            <span className="shrink-0">Target {row.target}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Props {
  subjectUuid: string;
  period: KpiV2Period;
  role: "csc_consultant" | "cst_assistant" | "developer" | null;
}

export function MiniKpiSummary({ subjectUuid, period, role }: Props) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [overall, setOverall] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!subjectUuid || !role) return;
    setLoading(true);
    (async () => {
      const next: Row[] = [];
      if (role === "csc_consultant") {
        const [r, c, t] = await Promise.all([
          fetchRetention(subjectUuid, period),
          fetchCommunication(subjectUuid, period),
          fetchCscTasks(subjectUuid, period),
        ]);
        next.push({
          key: "retention",
          label: "Retention",
          icon: Users,
          pct: r.pct,
          target: 100,
          detail: r.total > 0 ? `${r.total - r.churned}/${r.total} retained` : "No assignments",
        });
        next.push({
          key: "comms",
          label: "Communication",
          icon: Mail,
          pct: c.pct,
          target: 80,
          detail: c.total > 0 ? `${c.met}/${c.total} within 12h` : "No messages",
        });
        next.push({
          key: "tasks",
          label: "Tasks",
          icon: CheckSquare,
          pct: t.pct,
          target: 90,
          detail: t.total > 0 ? `${t.completed}/${t.total} on time` : "No tasks",
        });
      } else if (role === "cst_assistant") {
        // Reuse assistant task calc inline (lightweight)
        const { startIso, endIso } = getPeriodRange(period);
        const startTs = `${startIso}T00:00:00.000Z`;
        const endTs = `${endIso}T23:59:59.999Z`;
        const sb = supabase as any;
        const [ttCreated, ttFollowers, cai, ops] = await Promise.all([
          sb.from("tasks_tenants").select("id, due_date, completed_at")
            .gte("created_at", startTs).lte("created_at", endTs).eq("created_by", subjectUuid),
          sb.from("tasks_tenants").select("id, due_date, completed_at")
            .gte("created_at", startTs).lte("created_at", endTs).contains("followers", [subjectUuid]),
          sb.from("client_action_items").select("id, due_date, completed_at")
            .gte("created_at", startTs).lte("created_at", endTs).eq("assignee_user_id", subjectUuid),
          sb.from("ops_work_items").select("id, due_at, completed_at")
            .gte("created_at", startTs).lte("created_at", endTs).eq("owner_user_uuid", subjectUuid),
        ]);
        const seen = new Set<string>();
        const rowsRaw: Array<{ due: string; completed_at: string | null; isTs: boolean }> = [];
        const push = (id: string, due: string | null, ca: string | null) => {
          if (!due || seen.has(id)) return;
          seen.add(id);
          rowsRaw.push({ due, completed_at: ca, isTs: false });
        };
        (ttCreated.data ?? []).forEach((r: any) => push(`tt:${r.id}`, r.due_date, r.completed_at));
        (ttFollowers.data ?? []).forEach((r: any) => push(`tt:${r.id}`, r.due_date, r.completed_at));
        (cai.data ?? []).forEach((r: any) => r.due_date && rowsRaw.push({ due: r.due_date, completed_at: r.completed_at, isTs: false }));
        (ops.data ?? []).forEach((r: any) => r.due_at && rowsRaw.push({ due: r.due_at, completed_at: r.completed_at, isTs: true }));
        const total = rowsRaw.length;
        const onTime = rowsRaw.filter((r) => {
          if (!r.completed_at) return false;
          return r.isTs
            ? new Date(r.completed_at).getTime() <= new Date(r.due).getTime()
            : (r.completed_at as string).slice(0, 10) <= r.due;
        }).length;
        const pct = total === 0 ? null : (onTime / total) * 100;
        next.push({
          key: "tasks",
          label: "Tasks on time",
          icon: CheckSquare,
          pct,
          target: 85,
          detail: total > 0 ? `${onTime}/${total} completed on time` : "No tasks due",
        });
      }
      if (cancelled) return;
      setRows(next);
      const vals = next.map((r) => r.pct).filter((v): v is number => v != null);
      setOverall(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [subjectUuid, period, role]);

  if (role === "developer") {
    return (
      <div className="text-xs text-muted-foreground py-3 text-center">
        Developer KPIs — coming soon.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return <div className="text-xs text-muted-foreground py-3 text-center">No KPI data.</div>;
  }

  const overallColor = overall == null ? "#94a3b8"
    : overall >= 90 ? "#10b981"
    : overall >= 75 ? "#f59e0b"
    : "#ED1878";

  return (
    <div className="flex flex-col gap-2">
      {/* Overall header strip */}
      <button
        onClick={() => navigate("/kpi")}
        className="group flex items-center justify-between rounded-lg border border-transparent bg-gradient-to-r from-[#7130A0]/8 via-[#23C0DD]/8 to-transparent hover:border-[#23C0DD]/40 transition-colors px-2.5 py-1.5 text-left"
      >
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Overall this period
          </div>
          <div className="text-lg font-bold leading-none tabular-nums" style={{ color: overallColor }}>
            {overall == null ? "—" : `${Math.round(overall)}%`}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-[#23C0DD]" />
      </button>

      {rows.map((row) => <MiniRow key={row.key} row={row} />)}
    </div>
  );
}
