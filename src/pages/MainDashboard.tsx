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
  Megaphone,
  ListChecks,
  MessageSquare,
  Target,
  HeartPulse,
  Gauge,
  Zap,
  Users as UsersIcon,
  AlertTriangle,
  CalendarClock,
  TrendingUp,
  Trophy,
  ChevronRight,
  type LucideIcon,
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
import { formatDistanceToNow, format } from "date-fns";
import { clientAvatarColor, clientInitials } from "@/lib/clientAvatarColor";

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
  icon: Icon,
  children,
  footerHref,
  footerLabel,
  onFooterClick,
  className,
  bodyClassName,
  actions,
}: {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  footerHref?: string;
  footerLabel?: string;
  onFooterClick?: () => void;
  className?: string;
  bodyClassName?: string;
  actions?: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div
      className={`bg-white rounded-xl flex flex-col border border-border shadow-[0_1px_2px_rgba(17,24,39,0.04)] ${className ?? ""}`}
    >
      <div className="px-3.5 pt-2.5 pb-1.5 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon className="h-3.5 w-3.5 text-[#7130A0] shrink-0" />}
          <div className="text-[13px] font-semibold text-foreground truncate">{title}</div>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      <div className={`px-3 py-2.5 flex-1 min-h-0 ${bodyClassName ?? ""}`}>{children}</div>
      {(footerHref || onFooterClick) && (
        <button
          type="button"
          onClick={() => {
            if (onFooterClick) onFooterClick();
            else if (footerHref) navigate(footerHref);
          }}
          className="text-xs font-medium text-[#7130A0] hover:text-[#ED1878] px-3.5 py-2 border-t border-border inline-flex items-center gap-1 transition-colors"
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
  accentColor?: string;
  topAccent?: string;
  icon?: LucideIcon;
}

function SummaryCard({ title, value, sub, onClick, accentColor, topAccent, icon: Icon }: SummaryCardProps) {
  const clickable = !!onClick;
  const Comp: any = clickable ? "button" : "div";
  return (
    <Comp
      type={clickable ? "button" : undefined}
      onClick={onClick}
      className={`relative overflow-hidden bg-white rounded-xl px-4 py-3 flex flex-col justify-between min-h-[92px] border border-border shadow-[0_1px_2px_rgba(17,24,39,0.04)] text-left transition-all ${
        clickable ? "hover:border-[#7130A0]/40 hover:shadow-[0_2px_8px_rgba(113,48,160,0.10)] cursor-pointer" : ""
      }`}
    >
      {topAccent && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{ background: topAccent }}
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</div>
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground/60" />}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
        <div
          className="text-[26px] font-semibold leading-none tabular-nums"
          style={accentColor ? { color: accentColor } : undefined}
        >
          {value}
        </div>
        {sub && <div className="text-[11px] text-muted-foreground leading-tight">{sub}</div>}
      </div>
    </Comp>
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
  const size = 118;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={stroke}
          />
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
                strokeLinecap="butt"
              />
            );
            offset += len;
            return segment;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-lg font-semibold leading-none text-foreground tabular-nums">{total}</div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">clients</div>
        </div>
      </div>
      <div className="flex-1 min-w-0 grid grid-cols-1 gap-y-1 text-[11px]">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-muted-foreground truncate">{d.label}</span>
            <span className="ml-auto font-semibold text-foreground tabular-nums">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ Quick action tile ------------------------------ */

function QuickActionTile({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 rounded-lg border border-border bg-white hover:bg-[#7130A0]/5 hover:border-[#7130A0]/40 transition-colors px-2 py-2.5 text-center"
    >
      <Icon className="h-4 w-4 text-[#7130A0]" />
      <span className="text-[10.5px] font-medium text-foreground leading-tight">{label}</span>
    </button>
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
  // Upcoming calendar
  const [upcoming, setUpcoming] = useState<any[]>([]);

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

    // Upcoming calendar
    (async () => {
      const email = profile?.email;
      if (!email) {
        setUpcoming([]);
        return;
      }
      const nowIso = new Date().toISOString();
      // Fetch a wider window in parallel: (a) events organized by viewer, (b) events owned by viewer's user_id
      // (attendees is jsonb — filter client-side to honour "attendees contains my email").
      const [byOrganizer, byUser] = await Promise.all([
        sb
          .from("calendar_events")
          .select("id, title, start_at, end_at, organizer_email, organiser_email, attendees")
          .gt("start_at", nowIso)
          .or(`organizer_email.eq.${email},organiser_email.eq.${email}`)
          .order("start_at", { ascending: true })
          .limit(20),
        userUuid
          ? sb
              .from("calendar_events")
              .select("id, title, start_at, end_at, organizer_email, organiser_email, attendees")
              .gt("start_at", nowIso)
              .eq("user_id", userUuid)
              .order("start_at", { ascending: true })
              .limit(40)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const emailLower = email.toLowerCase();
      const merged = new Map<string, any>();
      const consider = (row: any) => {
        const org = (row.organizer_email ?? row.organiser_email ?? "").toLowerCase();
        const attendeesText = JSON.stringify(row.attendees ?? "").toLowerCase();
        if (org === emailLower || attendeesText.includes(emailLower)) {
          if (!merged.has(row.id)) merged.set(row.id, row);
        }
      };
      (byOrganizer.data ?? []).forEach(consider);
      (byUser.data ?? []).forEach(consider);
      const sorted = Array.from(merged.values())
        .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
        .slice(0, 4);
      setUpcoming(sorted);
    })();
  }, [isStaff, userUuid, kpiRole, refreshTick, period, profile?.email]);

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

  // Client-side task filter tabs (works on already-loaded array)
  const [taskFilter, setTaskFilter] = useState<"all" | "overdue" | "today">("all");
  const filteredTasks = tasks.filter((t) => {
    if (taskFilter === "overdue") return t.dueDate && t.dueDate < today;
    if (taskFilter === "today") return t.dueDate === today;
    return true;
  });

  const todayLabel = format(new Date(), "EEE, d MMM");

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-3">
        {/* Header band */}
        <div className="relative overflow-hidden bg-white rounded-xl border border-border shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-1"
            style={{ background: "linear-gradient(180deg, #ED1878 0%, #7130A0 100%)" }}
          />
          <div className="flex items-center justify-between gap-4 flex-wrap px-5 py-4 pl-6">
            <div className="min-w-0">
              <h1
                className="text-foreground flex items-baseline gap-3 flex-wrap"
                style={{ fontFamily: "Anton, sans-serif", fontSize: "22px", lineHeight: 1.2 }}
              >
                Welcome back, {firstName}!
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-normal text-muted-foreground bg-muted rounded-full px-2 py-0.5"
                  style={{ fontFamily: "Calibri, sans-serif" }}
                >
                  <CalendarClock className="h-3 w-3" /> {todayLabel}
                </span>
              </h1>
              <p
                className="text-muted-foreground mt-1"
                style={{ fontFamily: "Calibri, sans-serif", fontSize: "13px" }}
              >
                Here's what's happening today.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setMeetingOpen(true)}
                className="gap-1.5 border-[#7130A0]/30 text-[#7130A0] hover:bg-[#7130A0]/5 hover:text-[#7130A0]"
              >
                <CalendarPlus className="h-4 w-4" /> Schedule Meeting
              </Button>
              <Button
                onClick={() => setTaskDialogOpen(true)}
                style={{ backgroundColor: "#ED1878", color: "white" }}
                className="hover:opacity-90 gap-1.5"
              >
                <Plus className="h-4 w-4" /> New Task
              </Button>
            </div>
          </div>
        </div>

        {/* 6 summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <SummaryCard
            title="Clients"
            value={clientCount ?? "…"}
            sub="active"
            icon={UsersIcon}
            topAccent="#23C0DD"
            onClick={() => navigate("/manage-tenants")}
          />
          <SummaryCard
            title="Overdue Tasks"
            value={overdueCount ?? "…"}
            icon={AlertTriangle}
            accentColor={overdueCount && overdueCount > 0 ? "#C62828" : undefined}
            topAccent={overdueCount && overdueCount > 0 ? "#C62828" : "#E5E7EB"}
            onClick={() => navigate("/tasks")}
          />
          <SummaryCard
            title="Due Today"
            value={dueTodayCount ?? "…"}
            icon={CalendarClock}
            accentColor={dueTodayCount && dueTodayCount > 0 ? "#856404" : undefined}
            topAccent={dueTodayCount && dueTodayCount > 0 ? "#F59E0B" : "#E5E7EB"}
            onClick={() => navigate("/tasks")}
          />
          <SummaryCard
            title="Team Workload"
            value={
              labour?.overdue_ratio_pct === null || labour?.overdue_ratio_pct === undefined
                ? "—"
                : `${Math.round(labour.overdue_ratio_pct)}%`
            }
            sub={`across ${labour?.client_count ?? 0} clients`}
            icon={TrendingUp}
            topAccent="#7130A0"
          />
          <SummaryCard
            title="KPI Score"
            value={kpiValue}
            icon={Gauge}
            topAccent="#44235F"
            onClick={() => navigate("/kpi")}
          />
          <SummaryCard
            title="Rocks"
            value={rocks ? `${rocks.onTrack}/${rocks.total}` : "…"}
            sub="on track"
            icon={Trophy}
            topAccent="#ED1878"
            onClick={() => navigate("/eos/rocks")}
          />
        </div>

        {/* 3-column panel grid */}
        <div className="grid gap-3 grid-cols-1 lg:[grid-template-columns:minmax(0,36fr)_minmax(0,40fr)_minmax(0,24fr)]">
          {/* — Left column — */}
          <div className="flex flex-col gap-3 min-w-0">
            <Panel title="Recent Client Broadcasts" icon={Megaphone} footerHref="/communications">
              {broadcasts.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 py-6 text-center">
                  <Megaphone className="h-6 w-6 text-[#7130A0]/25" />
                  <div className="text-sm text-muted-foreground">No broadcasts yet.</div>
                </div>
              ) : (
                <ul className="divide-y divide-border -my-1">
                  {broadcasts.map((b) => (
                    <li key={b.id} className="py-2">
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

            <Panel
              title="Tasks Overview"
              icon={ListChecks}
              footerHref="/tasks"
              actions={
                <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
                  {(["all", "overdue", "today"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setTaskFilter(k)}
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize transition-colors ${
                        taskFilter === k
                          ? "bg-white text-[#7130A0] shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              }
            >
              {filteredTasks.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 py-6 text-center">
                  <ListChecks className="h-6 w-6 text-[#7130A0]/25" />
                  <div className="text-sm text-muted-foreground">
                    {taskFilter === "all" ? "No open tasks." : `No ${taskFilter} tasks.`}
                  </div>
                </div>
              ) : (
                <ul className="space-y-0.5 max-h-[380px] overflow-auto pr-1">
                  {filteredTasks.slice(0, 15).map((t) => {
                    const pr = normalizePriority(t.priority);
                    const prColor = priorityColor(pr);
                    const overdue = t.dueDate && t.dueDate < today;
                    const dueToday = t.dueDate === today;
                    return (
                      <li key={t.id} className="flex items-center gap-2 py-1 group">
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
                            {t.dueDate.slice(5)}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            <Panel title="Quick Actions" icon={Zap}>
              <div className="grid grid-cols-3 gap-1.5">
                <QuickActionTile
                  icon={UserPlus}
                  label="Add Client"
                  onClick={() => navigate("/manage-tenants")}
                />
                <QuickActionTile
                  icon={ClipboardList}
                  label="New Task"
                  onClick={() => setTaskDialogOpen(true)}
                />
                <QuickActionTile
                  icon={CalendarPlus}
                  label="Meeting"
                  onClick={() => setMeetingOpen(true)}
                />
                <QuickActionTile
                  icon={Upload}
                  label="Upload"
                  onClick={() => {
                    toast({
                      title: "Open a client to upload",
                      description: "Documents are scoped to a client. Pick one from Manage Clients.",
                    });
                    navigate("/manage-tenants");
                  }}
                />
                <QuickActionTile
                  icon={Ticket}
                  label="Ticket"
                  onClick={() => setTicketOpen(true)}
                />
                <QuickActionTile
                  icon={MessageSquare}
                  label="Message"
                  onClick={() => navigate("/communications")}
                />
              </div>
            </Panel>
          </div>

          {/* — Centre column — */}
          <div className="flex flex-col gap-3 min-w-0">
            <Panel title="Client Messages" icon={MessageSquare} footerHref="/inbox">
              {clientMsgs.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 py-6 text-center">
                  <MessageSquare className="h-6 w-6 text-[#7130A0]/25" />
                  <div className="text-sm text-muted-foreground">No client messages.</div>
                </div>
              ) : (
                <ul className="divide-y divide-border -my-1">
                  {clientMsgs.map((m) => {
                    const av = clientAvatarColor(m.tenant_id);
                    return (
                      <li key={m.id} className="py-2 flex items-start gap-2.5">
                        <div
                          className={`h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${av.solid}`}
                        >
                          {clientInitials(m.tenant_name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm font-medium text-foreground truncate">{m.tenant_name}</div>
                            <span className="text-[11px] text-muted-foreground shrink-0">
                              {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{m.body}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            <Panel title="Rocks (Quarterly Priorities)" icon={Target} footerHref="/eos/rocks">
              {!rocks || rocks.list.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 py-6 text-center">
                  <Target className="h-6 w-6 text-[#7130A0]/25" />
                  <div className="text-sm text-muted-foreground">No active rocks.</div>
                </div>
              ) : (
                <ul className="space-y-1.5 max-h-[380px] overflow-auto pr-1">
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
                    const pct =
                      typeof r.completion_percentage === "number"
                        ? Math.max(0, Math.min(100, r.completion_percentage))
                        : s === "done" || s === "complete"
                        ? 100
                        : s === "on_track"
                        ? 60
                        : s === "at_risk"
                        ? 40
                        : s === "off_track"
                        ? 20
                        : 0;
                    return (
                      <li key={r.id} className="py-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-foreground flex-1 truncate">{r.title}</span>
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded capitalize shrink-0"
                            style={{ backgroundColor: `${badgeColor}20`, color: badgeColor }}
                          >
                            {label}
                          </span>
                        </div>
                        <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: badgeColor }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>

          {/* — Right column — */}
          <div className="flex flex-col gap-3 min-w-0">
            <Panel title="Client Health" icon={HeartPulse} footerHref="/manage-tenants">
              <ClientHealthDonut data={healthDonutData} />
            </Panel>

            <Panel title="KPI Dashboard" icon={Gauge} footerHref="/kpi" bodyClassName="!py-2">
              <div className="[&_.grid]:!gap-2 [&_h3]:!text-xs [&_.text-2xl]:!text-lg [&_.text-3xl]:!text-xl">
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

          </div>
        </div>

        {/* Upcoming Calendar (full-width) */}
        <Panel title="Upcoming Calendar" icon={CalendarClock} footerHref="/calendar">
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-6 text-center">
              <CalendarClock className="h-6 w-6 text-[#7130A0]/25" />
              <div className="text-sm text-muted-foreground">No upcoming events.</div>
            </div>
          ) : (
            <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
              {upcoming.map((ev) => {
                const start = new Date(ev.start_at);
                const end = ev.end_at ? new Date(ev.end_at) : null;
                return (
                  <button
                    key={ev.id}
                    onClick={() => navigate("/calendar")}
                    className="relative overflow-hidden shrink-0 w-[260px] text-left rounded-lg border border-border bg-white hover:bg-[#23C0DD]/5 hover:border-[#23C0DD]/40 transition-colors p-3 pl-4 flex gap-3"
                  >
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 w-1"
                      style={{ backgroundColor: "#23C0DD" }}
                    />
                    <div className="flex flex-col items-center justify-center rounded-md bg-muted px-2 py-1 min-w-[44px]">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {format(start, "MMM")}
                      </div>
                      <div className="text-lg font-semibold leading-none text-foreground">
                        {format(start, "d")}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground truncate">
                        {ev.title || "(no title)"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {format(start, "h:mm a")}
                        {end ? ` – ${format(end, "h:mm a")}` : ""}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {format(start, "EEE")}
                      </div>
                    </div>
                  </button>
                );
              })}
              <button
                onClick={() => navigate("/calendar")}
                className="shrink-0 w-[160px] rounded-lg border border-dashed border-border text-muted-foreground hover:text-[#7130A0] hover:border-[#7130A0]/40 transition-colors p-3 flex flex-col items-center justify-center gap-1"
              >
                <ChevronRight className="h-4 w-4" />
                <span className="text-xs font-medium">See full week</span>
              </button>
            </div>
          )}
        </Panel>
      </div>



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
