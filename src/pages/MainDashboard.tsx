import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { isVivacityStaffRole } from "@/lib/roles/vivacityRoles";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, ArrowRight } from "lucide-react";
import { AddStaffTaskDialog } from "@/components/AddStaffTaskDialog";
import { fetchCscTasks, fetchAssistantTasks } from "@/lib/kpi-v2/fetchers";
import { defaultPeriod } from "@/components/kpi-v2/types";

interface CardProps {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  onClick?: () => void;
  linkLabel?: string;
  accentColor?: string;
}

function SummaryCard({ title, value, sub, onClick, linkLabel, accentColor }: CardProps) {
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

function todayIsoLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function MainDashboard() {
  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isStaff = isVivacityStaffRole(profile?.unicorn_role);

  useEffect(() => {
    if (!authLoading && profile && !isStaff) {
      navigate("/client/home", { replace: true });
    }
  }, [authLoading, profile, isStaff, navigate]);

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [clientCount, setClientCount] = useState<number | null>(null);
  const [overdueCount, setOverdueCount] = useState<number | null>(null);
  const [dueTodayCount, setDueTodayCount] = useState<number | null>(null);
  const [labour, setLabour] = useState<{ overdue_ratio_pct: number | null; client_count: number | null } | null>(null);
  const [kpiPct, setKpiPct] = useState<number | null>(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [rocks, setRocks] = useState<{ total: number; onTrack: number } | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const userUuid = profile?.user_uuid;
  const kpiRole = profile?.kpi_role ?? null;

  useEffect(() => {
    if (!isStaff || !userUuid) return;
    const today = todayIsoLocal();

    (async () => {
      // 1. Clients
      const { count } = await (supabase as any)
        .from("v_dashboard_attention_ranked")
        .select("*", { count: "exact", head: true })
        .eq("assigned_csc_user_id", userUuid)
        .eq("tenant_status", "active");
      setClientCount(count ?? 0);
    })();

    (async () => {
      // 2 + 3. Overdue + Due today (union of three sources)
      const sb = supabase as any;
      const [ttCreated, ttFollowers, caiOwner, caiAssignee, opsOwner, opsCreator] = await Promise.all([
        sb.from("tasks_tenants").select("id, due_date").eq("created_by", userUuid),
        sb.from("tasks_tenants").select("id, due_date").contains("followers", [userUuid]),
        sb
          .from("client_action_items")
          .select("id, due_date, status")
          .eq("owner_user_id", userUuid)
          .not("status", "in", "(done,cancelled)"),
        sb
          .from("client_action_items")
          .select("id, due_date, status")
          .eq("assignee_user_id", userUuid)
          .not("status", "in", "(done,cancelled)"),
        sb
          .from("ops_work_items")
          .select("id, due_at, status")
          .eq("owner_user_uuid", userUuid)
          .not("status", "in", "(done,cancelled)"),
        sb
          .from("ops_work_items")
          .select("id, due_at, status")
          .eq("created_by", userUuid)
          .not("status", "in", "(done,cancelled)"),
      ]);

      const seenTT = new Set<string>();
      const seenCAI = new Set<string>();
      const seenOps = new Set<string>();
      let overdue = 0;
      let dueToday = 0;

      const pushDate = (raw: string | null, isTs: boolean) => {
        if (!raw) return;
        const dateStr = isTs ? raw.slice(0, 10) : raw;
        if (dateStr < today) overdue++;
        else if (dateStr === today) dueToday++;
      };

      [...(ttCreated.data ?? []), ...(ttFollowers.data ?? [])].forEach((r: any) => {
        if (seenTT.has(r.id)) return;
        seenTT.add(r.id);
        pushDate(r.due_date, false);
      });
      [...(caiOwner.data ?? []), ...(caiAssignee.data ?? [])].forEach((r: any) => {
        if (seenCAI.has(r.id)) return;
        seenCAI.add(r.id);
        pushDate(r.due_date, false);
      });
      [...(opsOwner.data ?? []), ...(opsCreator.data ?? [])].forEach((r: any) => {
        if (seenOps.has(r.id)) return;
        seenOps.add(r.id);
        pushDate(r.due_at, true);
      });

      setOverdueCount(overdue);
      setDueTodayCount(dueToday);
    })();

    (async () => {
      // 4. Team workload
      const { data } = await (supabase as any)
        .from("v_dashboard_labour_efficiency")
        .select("overdue_ratio_pct, client_count")
        .eq("csc_user_id", userUuid)
        .maybeSingle();
      setLabour({
        overdue_ratio_pct: data?.overdue_ratio_pct ?? null,
        client_count: data?.client_count ?? null,
      });
    })();

    (async () => {
      // 5. KPI Overall Score
      setKpiLoading(true);
      if (kpiRole === "csc_consultant") {
        const res = await fetchCscTasks(userUuid, defaultPeriod());
        setKpiPct(res.pct);
      } else if (kpiRole === "cst_assistant") {
        const res = await fetchAssistantTasks(userUuid, defaultPeriod());
        setKpiPct(res.pct);
      } else {
        setKpiPct(null);
      }
      setKpiLoading(false);
    })();

    (async () => {
      // 6. Rocks
      const { data } = await (supabase as any)
        .from("eos_rocks")
        .select("status")
        .is("archived_at", null)
        .eq("level", "company");
      const rows = data ?? [];
      const onTrack = rows.filter((r: any) => (r.status ?? "").toLowerCase() === "on_track" || (r.status ?? "").toLowerCase() === "on track").length;
      setRocks({ total: rows.length, onTrack });
    })();
  }, [isStaff, userUuid, kpiRole, refreshTick]);

  const firstName = profile?.first_name || "there";

  const kpiValue = useMemo(() => {
    if (kpiRole === "developer") {
      return <span className="text-sm font-medium text-muted-foreground bg-muted rounded-full px-3 py-1 inline-block">Coming soon</span>;
    }
    if (kpiLoading) return "…";
    if (kpiPct === null) return "—";
    return `${Math.round(kpiPct)}%`;
  }, [kpiRole, kpiPct, kpiLoading]);

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
          <SummaryCard
            title="Clients"
            value={clientCount ?? "…"}
            sub="Active"
          />
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
          <SummaryCard
            title="KPI Overall Score"
            value={kpiValue}
            onClick={() => navigate("/kpi")}
          />
          <SummaryCard
            title="Rocks Progress"
            value={rocks ? `${rocks.onTrack} of ${rocks.total}` : "…"}
            sub="on track"
            onClick={() => navigate("/eos/rocks")}
          />
        </div>
      </div>

      <AddStaffTaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        onSuccess={() => {
          setTaskDialogOpen(false);
          setRefreshTick((t) => t + 1);
        }}
      />
    </DashboardLayout>
  );
}
