import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useKpiAccess } from "@/hooks/useKpiAccess";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ShieldAlert, ArrowRight } from "lucide-react";
import type { KpiRole } from "@/hooks/useKpiSummary";
import type { OverallStatus, PeriodType } from "@/hooks/useKpiReview";

const ROLE_LABEL: Record<KpiRole, string> = { csc: "CSC", cst: "CST", dev: "Dev" };
const ROLE_TO_UNICORN: Record<KpiRole, string[]> = {
  csc: ["CSC"],
  cst: ["CET", "Admin", "User"],
  dev: ["Team Member", "Team Leader", "Integrator"],
};

const STATUS_LABEL: Record<OverallStatus, string> = {
  exceeds: "Exceeds",
  on_track: "On Track",
  at_risk: "At Risk",
  off_track: "Off Track",
};
const STATUS_VARIANT: Record<OverallStatus, "default" | "secondary" | "destructive" | "outline"> = {
  exceeds: "default",
  on_track: "default",
  at_risk: "secondary",
  off_track: "destructive",
};

function defaultPeriod(periodType: PeriodType) {
  const now = new Date();
  let start: Date, end: Date;
  if (periodType === "monthly") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (periodType === "quarterly") {
    const q = Math.floor(now.getMonth() / 3);
    start = new Date(now.getFullYear(), q * 3, 1);
    end = new Date(now.getFullYear(), q * 3 + 3, 0);
  } else {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear(), 11, 31);
  }
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

interface StaffRow {
  user_uuid: string;
  display_name: string;
  unicorn_role: string | null;
  is_qa: boolean;
}

interface OverviewRow extends StaffRow {
  computed: OverallStatus | null;
  reviewId: number | null;
  locked: boolean;
  signoffCount: number;
}

function StatusPill({ status }: { status: OverallStatus | null }) {
  if (!status) return <Badge variant="outline">No data</Badge>;
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

export default function KpiOverviewPage() {
  const { canViewAnyStaff, loading: accessLoading } = useKpiAccess();
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const initial = defaultPeriod("monthly");
  const [periodStart, setPeriodStart] = useState(initial.start);
  const [periodEnd, setPeriodEnd] = useState(initial.end);
  const [rowsByRole, setRowsByRole] = useState<Record<KpiRole, OverviewRow[]>>({ csc: [], cst: [], dev: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const p = defaultPeriod(periodType);
    setPeriodStart(p.start);
    setPeriodEnd(p.end);
  }, [periodType]);

  const load = useMemo(() => async () => {
    setLoading(true);
    try {
      const { data: users } = await (supabase as any)
        .from("users")
        .select("user_uuid, first_name, last_name, email, unicorn_role, is_vivacity_internal, status, kpi_pod")
        .eq("is_vivacity_internal", true)
        .neq("status", "archived")
        .order("first_name", { ascending: true });

      const all: StaffRow[] = (users ?? []).map((u: any) => ({
        user_uuid: u.user_uuid,
        display_name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || "Unknown",
        unicorn_role: u.unicorn_role,
        is_qa: u.kpi_pod === "qa",
      }));

      const result: Record<KpiRole, OverviewRow[]> = { csc: [], cst: [], dev: [] };

      for (const role of Object.keys(ROLE_LABEL) as KpiRole[]) {
        const filtered = all.filter((u) => ROLE_TO_UNICORN[role].includes(u.unicorn_role ?? ""));
        if (filtered.length === 0) continue;

        // Existing reviews for this role + period.
        const { data: reviews } = await (supabase as any)
          .from("kpi_reviews")
          .select("id, subject_uuid, locked_at")
          .eq("kpi_role", role)
          .eq("period_type", periodType)
          .eq("period_start", periodStart)
          .in("subject_uuid", filtered.map((f) => f.user_uuid));
        const reviewBySubject = new Map<string, { id: number; locked_at: string | null }>(
          (reviews ?? []).map((r: any) => [r.subject_uuid, { id: r.id, locked_at: r.locked_at }]),
        );

        // Sign-offs grouped by review_id.
        const reviewIds = (reviews ?? []).map((r: any) => r.id);
        let signoffsByReview = new Map<number, number>();
        if (reviewIds.length > 0) {
          const { data: signoffs } = await (supabase as any)
            .from("kpi_review_signoffs")
            .select("review_id")
            .in("review_id", reviewIds);
          for (const s of signoffs ?? []) {
            signoffsByReview.set(s.review_id, (signoffsByReview.get(s.review_id) ?? 0) + 1);
          }
        }

        // Compute status in parallel for each staff member.
        const computed = await Promise.all(
          filtered.map(async (u) => {
            const { data } = await (supabase as any).rpc("compute_kpi_overall_status", {
              p_kpi_role: role,
              p_subject_uuid: u.user_uuid,
              p_period_start: periodStart,
              p_period_end: periodEnd,
            });
            const first = Array.isArray(data) ? data[0] : data;
            return (first?.overall_status as OverallStatus | null) ?? null;
          }),
        );

        result[role] = filtered.map((u, i) => {
          const rev = reviewBySubject.get(u.user_uuid);
          return {
            ...u,
            computed: computed[i],
            reviewId: rev?.id ?? null,
            locked: !!rev?.locked_at,
            signoffCount: rev ? signoffsByReview.get(rev.id) ?? 0 : 0,
          };
        });
      }

      setRowsByRole(result);
    } finally {
      setLoading(false);
    }
  }, [periodType, periodStart, periodEnd]);

  useEffect(() => {
    if (canViewAnyStaff) load();
  }, [canViewAnyStaff, load]);

  if (accessLoading) {
    return (
      <DashboardLayout>
        <div className="p-8 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </DashboardLayout>
    );
  }

  if (!canViewAnyStaff) {
    return (
      <DashboardLayout>
        <div className="p-8 max-w-md mx-auto text-center space-y-2">
          <ShieldAlert className="h-8 w-8 mx-auto text-muted-foreground" />
          <h1 className="text-lg font-semibold">Reviewer access required</h1>
          <p className="text-sm text-muted-foreground">
            This page is only available to KPI reviewers and SuperAdmins.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">KPI overview</h1>
            <p className="text-sm text-muted-foreground">
              Auto-computed status for every staff member in the selected period.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Period type</Label>
              <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="w-[160px]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="w-[160px]" />
            </div>
            <Button onClick={() => load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Refresh
            </Button>
          </div>
        </div>

        {(Object.keys(ROLE_LABEL) as KpiRole[]).map((role) => (
          <Card key={role}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{ROLE_LABEL[role]} team</CardTitle>
              <span className="text-xs text-muted-foreground">{rowsByRole[role].length} staff</span>
            </CardHeader>
            <CardContent>
              {rowsByRole[role].length === 0 ? (
                <p className="text-sm text-muted-foreground">No staff in this role.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr className="border-b">
                        <th className="py-2 pr-4">Staff</th>
                        <th className="py-2 pr-4">Unicorn role</th>
                        <th className="py-2 pr-4">Computed status</th>
                        <th className="py-2 pr-4">Review</th>
                        <th className="py-2 pr-4">Sign-offs</th>
                        <th className="py-2 pr-4"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rowsByRole[role].map((r) => (
                        <tr key={r.user_uuid} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-medium">
                            <span className="inline-flex items-center gap-1.5">
                              {r.display_name}
                              {r.is_qa ? (
                                <span className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                                  QA
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">{r.unicorn_role ?? "—"}</td>
                          <td className="py-2 pr-4"><StatusPill status={r.computed} /></td>
                          <td className="py-2 pr-4">
                            {r.reviewId ? (
                              r.locked ? <Badge variant="outline">Locked</Badge> : <Badge variant="secondary">Draft</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">None</span>
                            )}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">{r.signoffCount}</td>
                          <td className="py-2 pr-4 text-right">
                            <Button asChild variant="ghost" size="sm">
                              <Link to={`/admin/kpi-review?role=${role}&subject=${r.user_uuid}`}>
                                Open <ArrowRight className="h-3 w-3 ml-1" />
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}
