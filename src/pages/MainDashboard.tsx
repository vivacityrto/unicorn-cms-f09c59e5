import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { isVivacityStaffRole } from "@/lib/roles/vivacityRoles";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Plus,
  ArrowRight,
  UserPlus,
  ClipboardList,
  CalendarPlus,
  Upload,
  Ticket,
} from "lucide-react";
import { AddStaffTaskDialog } from "@/components/AddStaffTaskDialog";
import { MeetingScheduler } from "@/components/eos/MeetingScheduler";
import { NewTicketModal } from "@/components/support-tickets/NewTicketModal";
import { CscKpiCards } from "@/components/kpi-v2/CscKpiCards";
import { AssistantKpiCards } from "@/components/kpi-v2/AssistantKpiCards";
import { DeveloperPlaceholder } from "@/components/kpi-v2/DeveloperPlaceholder";
import { fetchCscTasks, fetchAssistantTasks } from "@/lib/kpi-v2/fetchers";
import { defaultPeriod } from "@/components/kpi-v2/types";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

/* ------------------------------ helpers ------------------------------ */

function todayIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface UnifiedTask {
  id: string; // prefixed: tt-/ca-/ops-
  source: "tasks_tenants" | "client_action_items" | "ops_work_items";
  realId: string;
  title: string;
  dueDate: string | null; // yyyy-MM-dd
  priority: string | null;
  status: string | null;
}

function normalizePriority(p: unknown): "high" | "medium" | "low" | null {
  if (p === null || p === undefined) return null;
  const s = String(p).toLowerCase();
  if (["1", "high", "urgent", "critical"].includes(s)) return "high";
  if (["2", "medium", "med", "normal"].includes(s)) return "medium";
  if (["3", "low"].includes(s)) return "low";
  return null;
}

function priorityColor(p: "high" | "medium" | "low" | null): string | null {
  if (p === "high") return "#C62828";
  if (p === "medium") return "#856404";
  if (p === "low") return "#388E3C";
  return null;
}

/* ------------------------------ Panel ------------------------------ */

function Panel({
  title,
  children,
  footerHref,
  footerLabel,
  onFooterClick,
}: {
  title: string;
  children: React.ReactNode;
  footerHref?: string;
  footerLabel?: string;
  onFooterClick?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div
      className="bg-white rounded-xl flex flex-col"
      style={{ border: "0.5px solid hsl(var(--border))" }}
    >
      <div className="px-4 pt-3 pb-2 border-b" style={{ borderColor: "hsl(var(--border))" }}>
        <div className="text-sm font-semibold text-foreground">{title}</div>
      </div>
      <div className="p-3 flex-1 min-h-0">{children}</div>
      {(footerHref || onFooterClick) && (
        <button
          type="button"
          onClick={() => {
            if (onFooterClick) onFooterClick();
            else if (footerHref) navigate(footerHref);
          }}
          className="text-xs font-medium text-[#7130A0] hover:text-[#ED1878] px-4 py-2.5 border-t inline-flex items-center gap-1 transition-colors"
          style={{ borderColor: "hsl(var(--border))" }}
        >
          {footerLabel ?? "View all"} <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------ Summary card ------------------------------ */

interface SummaryCardProps {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  onClick?: () => void;
  linkLabel?: string;
  accentColor?: string;
}

function SummaryCard({ title, value, sub, onClick, linkLabel, accentColor }: SummaryCardProps) {
  return (
    <div
      className="bg-white rounded-xl p-4 flex flex-col justify-between min-h-[120px]"
      style={{ border: "0.5px solid hsl(var(--border))" }}
    >
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</div>
      <div className="mt-2 flex-1">
        <div
          className="text-3xl font-semibold leading-none"
          style={accentColor ? { color: accentColor } : undefined}
        >
          {value}
        </div>
        {sub && <div className="text-xs text-muted-foreground mt-1.5">{sub}</div>}
      </div>
      {onClick && (
        <button
          type="button"
          onClick={onClick}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#7130A0] hover:text-[#ED1878] transition-colors self-start"
        >
          {linkLabel ?? "View all"} <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------ Donut ------------------------------ */

function ClientHealthDonut({
  data,
}: {
  data: { label: string; value: number; color: string }[];
}) {
  const total = data.reduce((a, b) => a + b.value, 0);
  if (total === 0) {
    return <div className="text-sm text-muted-foreground py-4 text-center">No client data.</div>;
  }
  const size = 140;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={size} height={size} className="-rotate-90">
        {data.map((d) => {
          if (d.value === 0) return null;
          const len = (d.value / total) * circumference;
          const segment = (
            <circle
              key={d.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={d.color}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${circumference - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return segment;
        })}
      </svg>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs w-full">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="text-muted-foreground">{d.label}</span>
            <span className="ml-auto font-medium text-foreground">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================= Main ============================= */

export default function MainDashboard() {
  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isStaff = isVivacityStaffRole(profile?.unicorn_role);

  useEffect(() => {
    if (!authLoading && profile && !isStaff) {
      navigate("/client/home", { replace: true });
    }
  }, [authLoading, profile, isStaff, navigate]);

  // Dialogs
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);

  // Metric card state
  const [clientCount, setClientCount] = useState<number | null>(null);
  const [labour, setLabour] = useState<{ overdue_ratio_pct: number | null; client_count: number | null } | null>(null);
  const [kpiPct, setKpiPct] = useState<number | null>(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [rocks, setRocks] = useState<{ total: number; onTrack: number; list: any[] } | null>(null);

  // Tasks (unified list)
  const [tasks, setTasks] = useState<UnifiedTask[]>([]);
  const [overdueCount, setOverdueCount] = useState<number | null>(null);
  const [dueTodayCount, setDueTodayCount] = useState<number | null>(null);

  // Broadcasts
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  // Client messages
  const [clientMsgs, setClientMsgs] = useState<any[]>([]);
  // Client health
  const [health, setHealth] = useState<{ healthy: number; monitoring: number; at_risk: number; critical: number } | null>(null);

  const [refreshTick, setRefreshTick] = useState(0);

  const userUuid = profile?.user_uuid;
  const kpiRole = profile?.kpi_role ?? null;

  const period = useMemo(() => defaultPeriod(), []);

  useEffect(() => {
    if (!isStaff || !userUuid) return;
    const today = todayIsoLocal();
    const sb = supabase as any;

    // Clients + health donut (single view)
    (async () => {
      const { data } = await sb
        .from("v_dashboard_attention_ranked")
        .select("worst_stage_health_status")
        .eq("assigned_csc_user_id", userUuid)
        .eq("tenant_status", "active");
      const rows = data ?? [];
      setClientCount(rows.length);
      const counts = { healthy: 0, monitoring: 0, at_risk: 0, critical: 0 };
      rows.forEach((r: any) => {
        const k = (r.worst_stage_health_status ?? "").toLowerCase();
        if (k in counts) (counts as any)[k]++;
      });
      setHealth(counts);
    })();

    // Tasks union
    (async () => {
      const [ttCreated, ttFollowers, caiOwner, caiAssignee, opsOwner, opsCreator] = await Promise.all([
        sb.from("tasks_tenants").select("id, title, name, description, due_date, priority, status").eq("created_by", userUuid),
        sb.from("tasks_tenants").select("id, title, name, description, due_date, priority, status").contains("followers", [userUuid]),
        sb
          .from("client_action_items")
          .select("id, title, due_date, priority, status")
          .eq("owner_user_id", userUuid)
          .not("status", "in", "(done,cancelled)"),
        sb
          .from("client_action_items")
          .select("id, title, due_date, priority, status")
          .eq("assignee_user_id", userUuid)
          .not("status", "in", "(done,cancelled)"),
        sb
          .from("ops_work_items")
          .select("id, title, due_at, priority, status")
          .eq("owner_user_uuid", userUuid)
          .not("status", "in", "(done,cancelled)"),
        sb
          .from("ops_work_items")
          .select("id, title, due_at, priority, status")
          .eq("created_by", userUuid)
          .not("status", "in", "(done,cancelled)"),
      ]);

      const merged: UnifiedTask[] = [];
      const seen = new Set<string>();
      const pushTT = (r: any) => {
        const key = `tt-${r.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        merged.push({
          id: key,
          source: "tasks_tenants",
          realId: r.id,
          title: r.title || r.name || "Untitled task",
          dueDate: r.due_date ?? null,
          priority: r.priority ?? null,
          status: r.status ?? null,
        });
      };
      const pushCAI = (r: any) => {
        const key = `ca-${r.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        merged.push({
          id: key,
          source: "client_action_items",
          realId: r.id,
          title: r.title ?? "Untitled action",
          dueDate: r.due_date ?? null,
          priority: r.priority ?? null,
          status: r.status ?? null,
        });
      };
      const pushOps = (r: any) => {
        const key = `ops-${r.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        merged.push({
          id: key,
          source: "ops_work_items",
          realId: r.id,
          title: r.title ?? "Untitled work item",
          dueDate: r.due_at ? String(r.due_at).slice(0, 10) : null,
          priority: r.priority ?? null,
          status: r.status ?? null,
        });
      };
      [...(ttCreated.data ?? []), ...(ttFollowers.data ?? [])].forEach(pushTT);
      // Filter out completed for tasks_tenants (no server not-in filter above)
      const filteredTT = merged.filter(
        (t) => t.source !== "tasks_tenants" || (t.status !== "completed" && t.status !== "done" && t.status !== "cancelled"),
      );
      [...(caiOwner.data ?? []), ...(caiAssignee.data ?? [])].forEach(pushCAI);
      [...(opsOwner.data ?? []), ...(opsCreator.data ?? [])].forEach(pushOps);

      // Rebuild with all (filteredTT + others)
      const all = [
        ...filteredTT,
        ...merged.filter((t) => t.source !== "tasks_tenants"),
      ];

      // Count overdue / due today
      let overdue = 0;
      let due = 0;
      all.forEach((t) => {
        if (!t.dueDate) return;
        if (t.dueDate < today) overdue++;
        else if (t.dueDate === today) due++;
      });
      setOverdueCount(overdue);
      setDueTodayCount(due);

      // Sort: overdue first, then due date asc, no-date last
      all.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
      setTasks(all);
    })();

    // Labour
    (async () => {
      const { data } = await sb
        .from("v_dashboard_labour_efficiency")
        .select("overdue_ratio_pct, client_count")
        .eq("csc_user_id", userUuid)
        .maybeSingle();
      setLabour({
        overdue_ratio_pct: data?.overdue_ratio_pct ?? null,
        client_count: data?.client_count ?? null,
      });
    })();

    // KPI
    (async () => {
      setKpiLoading(true);
      if (kpiRole === "csc_consultant") {
        const res = await fetchCscTasks(userUuid, period);
        setKpiPct(res.pct);
      } else if (kpiRole === "cst_assistant") {
        const res = await fetchAssistantTasks(userUuid, period);
        setKpiPct(res.pct);
      } else {
        setKpiPct(null);
      }
      setKpiLoading(false);
    })();

    // Rocks
    (async () => {
      const { data } = await sb
        .from("eos_rocks")
        .select("id, title, status, due_date, completion_percentage")
        .is("archived_at", null)
        .eq("level", "company")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(20);
      const rows = data ?? [];
      const onTrack = rows.filter((r: any) => {
        const s = (r.status ?? "").toLowerCase();
        return s === "on_track" || s === "on track";
      }).length;
      setRocks({ total: rows.length, onTrack, list: rows });
    })();

    // Broadcasts
    (async () => {
      const { data } = await sb
        .from("broadcast_campaigns")
        .select("id, title, body, target_mode, total_recipients, sent_at")
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(4);
      setBroadcasts(data ?? []);
    })();

    // Client messages
    (async () => {
      const { data: assignments } = await sb
        .from("tenant_csc_assignments")
        .select("tenant_id")
        .eq("csc_user_id", userUuid)
        .is("ended_at", null);
      const tenantIds = (assignments ?? []).map((a: any) => a.tenant_id);
      if (tenantIds.length === 0) {
        setClientMsgs([]);
        return;
      }
      const { data: msgs } = await sb
        .from("tenant_messages")
        .select("id, tenant_id, body, sender_type, created_at")
        .in("tenant_id", tenantIds)
        .order("created_at", { ascending: false })
        .limit(6);
      const uniqueTenants = Array.from(new Set((msgs ?? []).map((m: any) => m.tenant_id)));
      const { data: tenants } = uniqueTenants.length
        ? await sb.from("tenants").select("id, name").in("id", uniqueTenants)
        : { data: [] as any[] };
      const nameMap = new Map<number, string>();
      (tenants ?? []).forEach((t: any) => nameMap.set(t.id, t.name));
      setClientMsgs(
        (msgs ?? []).map((m: any) => ({
          ...m,
          tenant_name: nameMap.get(m.tenant_id) ?? "Client",
        })),
      );
    })();
  }, [isStaff, userUuid, kpiRole, refreshTick, period]);

  const firstName = profile?.first_name || "there";

  const kpiValue = useMemo(() => {
    if (kpiRole === "developer") {
      return (
        <span className="text-sm font-medium text-muted-foreground bg-muted rounded-full px-3 py-1 inline-block">
          Coming soon
        </span>
      );
    }
    if (kpiLoading) return "…";
    if (kpiPct === null) return "—";
    return `${Math.round(kpiPct)}%`;
  }, [kpiRole, kpiPct, kpiLoading]);

  // Task complete toggle (optimistic)
  const handleCompleteTask = async (t: UnifiedTask) => {
    // Optimistic: remove
    setTasks((prev) => prev.filter((x) => x.id !== t.id));
    try {
      if (t.source === "client_action_items") {
        const { error } = await (supabase as any)
          .from("client_action_items")
          .update({
            status: "done",
            completed_at: new Date().toISOString(),
            completed_by: profile?.user_uuid ?? null,
          })
          .eq("id", t.realId);
        if (error) throw error;
      } else if (t.source === "ops_work_items") {
        const { error } = await (supabase as any)
          .from("ops_work_items")
          .update({ status: "done" })
          .eq("id", t.realId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("tasks_tenants")
          .update({ status: "completed", completed: true })
          .eq("id", t.realId);
        if (error) throw error;
      }
      toast({ title: "Task completed" });
    } catch (e: any) {
      // Revert
      setTasks((prev) => [t, ...prev]);
      toast({ title: "Failed to update task", description: e.message, variant: "destructive" });
    }
  };

  if (authLoading || !profile) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!isStaff) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const today = todayIsoLocal();

  const healthDonutData = health
    ? [
        { label: "Excellent", value: health.healthy, color: "#4CAF50" },
        { label: "Good", value: health.monitoring, color: "#2196F3" },
        { label: "At Risk", value: health.at_risk, color: "#FFC107" },
        { label: "Critical", value: health.critical, color: "#F44336" },
      ]
    : [];

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1
              className="text-foreground"
              style={{ fontFamily: "Anton, sans-serif", fontSize: "22px", lineHeight: 1.2 }}
            >
              Welcome back, {firstName}!
            </h1>
            <p
              className="text-muted-foreground mt-1"
              style={{ fontFamily: "Calibri, sans-serif", fontSize: "14px" }}
            >
              Here's what's happening today.
            </p>
          </div>
          <Button
            onClick={() => setTaskDialogOpen(true)}
            style={{ backgroundColor: "#ED1878", color: "white" }}
            className="hover:opacity-90 gap-1.5"
          >
            <Plus className="h-4 w-4" /> New Task
          </Button>
        </div>

        {/* 6 summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <SummaryCard title="Clients" value={clientCount ?? "…"} sub="Active" />
          <SummaryCard
            title="Overdue Tasks"
            value={overdueCount ?? "…"}
            accentColor={overdueCount && overdueCount > 0 ? "#C62828" : undefined}
            onClick={() => navigate("/tasks")}
          />
          <SummaryCard
            title="Due Today"
            value={dueTodayCount ?? "…"}
            accentColor={dueTodayCount && dueTodayCount > 0 ? "#856404" : undefined}
            onClick={() => navigate("/tasks")}
          />
          <SummaryCard
            title="Team Workload"
            value={
              labour?.overdue_ratio_pct === null || labour?.overdue_ratio_pct === undefined
                ? "—"
                : `${Math.round(labour.overdue_ratio_pct)}%`
            }
            sub={`overdue ratio across your ${labour?.client_count ?? 0} clients`}
          />
          <SummaryCard title="KPI Overall Score" value={kpiValue} onClick={() => navigate("/kpi")} />
          <SummaryCard
            title="Rocks Progress"
            value={rocks ? `${rocks.onTrack} of ${rocks.total}` : "…"}
            sub="on track"
            onClick={() => navigate("/eos/rocks")}
          />
        </div>

        {/* 3-column panel grid */}
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "minmax(0, 38fr) minmax(0, 38fr) minmax(0, 24fr)" }}
        >
          {/* — Left column — */}
          <div className="flex flex-col gap-3 min-w-0 col-panel-left">
            <Panel title="Recent Client Broadcasts" footerHref="/communications">
              {broadcasts.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">No broadcasts yet.</div>
              ) : (
                <ul className="space-y-2">
                  {broadcasts.map((b) => (
                    <li key={b.id} className="rounded-md border p-2.5" style={{ borderColor: "hsl(var(--border))" }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium text-foreground truncate">{b.title}</div>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {b.target_mode ?? "all"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{b.body}</div>
                      <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                        <span>{b.total_recipients ?? 0} recipients</span>
                        {b.sent_at && <span>· {formatDistanceToNow(new Date(b.sent_at), { addSuffix: true })}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Tasks Overview" footerHref="/tasks">
              {tasks.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">No open tasks.</div>
              ) : (
                <ul className="space-y-1.5 max-h-[360px] overflow-auto pr-1">
                  {tasks.slice(0, 12).map((t) => {
                    const pr = normalizePriority(t.priority);
                    const prColor = priorityColor(pr);
                    const overdue = t.dueDate && t.dueDate < today;
                    const dueToday = t.dueDate === today;
                    return (
                      <li key={t.id} className="flex items-center gap-2 py-1.5 group">
                        <Checkbox
                          onCheckedChange={() => handleCompleteTask(t)}
                          aria-label="Mark complete"
                        />
                        <span className="text-sm text-foreground flex-1 truncate">{t.title}</span>
                        {pr && (
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: `${prColor}1A`, color: prColor ?? undefined }}
                          >
                            {pr.toUpperCase()}
                          </span>
                        )}
                        {t.dueDate && (
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
                            style={{
                              backgroundColor: overdue
                                ? "#C6282820"
                                : dueToday
                                ? "#85640420"
                                : "hsl(var(--muted))",
                              color: overdue ? "#C62828" : dueToday ? "#856404" : "hsl(var(--muted-foreground))",
                            }}
                          >
                            {t.dueDate}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>

          {/* — Centre column — */}
          <div className="flex flex-col gap-3 min-w-0 col-panel-centre">
            <Panel title="Client Messages" footerHref="/inbox">
              {clientMsgs.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">No client messages.</div>
              ) : (
                <ul className="space-y-2">
                  {clientMsgs.map((m) => (
                    <li key={m.id} className="rounded-md border p-2.5" style={{ borderColor: "hsl(var(--border))" }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium text-foreground truncate">{m.tenant_name}</div>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{m.body}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Rocks (Quarterly Priorities)" footerHref="/eos/rocks">
              {!rocks || rocks.list.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">No active rocks.</div>
              ) : (
                <ul className="space-y-1.5 max-h-[360px] overflow-auto pr-1">
                  {rocks.list.slice(0, 8).map((r: any) => {
                    const s = (r.status ?? "").toLowerCase().replace(/\s+/g, "_");
                    const badgeColor =
                      s === "on_track"
                        ? "#4CAF50"
                        : s === "at_risk"
                        ? "#FFC107"
                        : s === "off_track"
                        ? "#F44336"
                        : s === "done" || s === "complete"
                        ? "#2196F3"
                        : "#9CA3AF";
                    const label = (r.status ?? "unknown").replace(/_/g, " ");
                    return (
                      <li key={r.id} className="flex items-center gap-2 py-1">
                        <span className="text-sm text-foreground flex-1 truncate">{r.title}</span>
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded capitalize shrink-0"
                          style={{ backgroundColor: `${badgeColor}20`, color: badgeColor }}
                        >
                          {label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>

          {/* — Right column — */}
          <div className="flex flex-col gap-3 min-w-0 col-panel-right">
            <Panel title="Client Health" footerHref="/manage-tenants">
              <ClientHealthDonut data={healthDonutData} />
            </Panel>

            <Panel title="KPI Dashboard" footerHref="/kpi">
              <div className="scale-90 origin-top-left -mb-4" style={{ width: "111%" }}>
                {kpiRole === "csc_consultant" && userUuid ? (
                  <CscKpiCards subjectUuid={userUuid} period={period} />
                ) : kpiRole === "cst_assistant" && userUuid ? (
                  <AssistantKpiCards subjectUuid={userUuid} period={period} />
                ) : kpiRole === "developer" ? (
                  <DeveloperPlaceholder />
                ) : (
                  <div className="text-sm text-muted-foreground py-4 text-center">
                    No KPI configured.
                  </div>
                )}
              </div>
            </Panel>

            <Panel title="Quick Actions">
              <div className="flex flex-col gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start gap-2"
                  onClick={() => navigate("/manage-tenants")}
                >
                  <UserPlus className="h-4 w-4" /> Add Client
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start gap-2"
                  onClick={() => setTaskDialogOpen(true)}
                >
                  <ClipboardList className="h-4 w-4" /> Create Task
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start gap-2"
                  onClick={() => setMeetingOpen(true)}
                >
                  <CalendarPlus className="h-4 w-4" /> Schedule Meeting
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start gap-2"
                  onClick={() => {
                    toast({
                      title: "Open a client to upload",
                      description: "Documents are scoped to a client. Pick one from Manage Clients.",
                    });
                    navigate("/manage-tenants");
                  }}
                >
                  <Upload className="h-4 w-4" /> Upload Document
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start gap-2"
                  onClick={() => setTicketOpen(true)}
                >
                  <Ticket className="h-4 w-4" /> New Ticket
                </Button>
              </div>
            </Panel>
          </div>
        </div>
      </div>

      {/* Responsive collapse */}
      <style>{`
        @media (max-width: 1023px) {
          .p-4 > .grid[style*="38fr"], .md\\:p-6 > .grid[style*="38fr"] {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>

      <AddStaffTaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        onSuccess={() => {
          setTaskDialogOpen(false);
          setRefreshTick((t) => t + 1);
        }}
      />
      <MeetingScheduler open={meetingOpen} onOpenChange={setMeetingOpen} onScheduled={() => setMeetingOpen(false)} />
      <NewTicketModal open={ticketOpen} onOpenChange={setTicketOpen} />
    </DashboardLayout>
  );
}
