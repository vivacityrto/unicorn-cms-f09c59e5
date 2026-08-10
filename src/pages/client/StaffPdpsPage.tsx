import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronDown, Download } from "lucide-react";
import { CurrencyStatusPill } from "@/components/academy/pdp/CurrencyStatusPill";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useWorkforcePdp } from "@/features/pdp/useWorkforcePdp";
import {
  useTenantAcademyStaffStats,
  type TenantAcademyStaffStatsRow,
} from "@/features/pdp/useTenantAcademyStaffStats";
import { useCycleSummary } from "@/features/pdp/hooks";
import { getCurrentCycle } from "@/features/pdp/api";
import type { WorkforcePdpRow } from "@/features/pdp/workforce";
import type { CurrencyStatus } from "@/features/pdp/types";

const ALL_STATUSES: CurrencyStatus[] = ["overdue", "at_risk", "on_track", "current"];
const STATUS_LABEL: Record<CurrencyStatus, string> = {
  overdue: "Overdue",
  at_risk: "At risk",
  on_track: "On track",
  current: "Current",
};
const STATUS_RANK: Record<CurrencyStatus, number> = {
  overdue: 0,
  at_risk: 1,
  on_track: 2,
  current: 3,
};

const NONE = "__none__";

const numberAU = new Intl.NumberFormat("en-AU", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), "dd/MM/yyyy");
  } catch {
    return "—";
  }
}

function fmtRelative(iso: string | null, whenNull: string): string {
  if (!iso) return whenNull;
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return whenNull;
  }
}

function formatCourseBreakdown(row: TenantAcademyStaffStatsRow): string {
  const completed = Number(row.enrollments_completed ?? 0);
  const active = Number(row.enrollments_active ?? 0);
  const total = Number(row.enrollments_total ?? 0);
  const notStarted = Math.max(0, total - completed - active);
  return `${completed} completed / ${active} in progress / ${notStarted} not started`;
}

interface DrawerState {
  row: WorkforcePdpRow | null;
}

function AcademyStaffActivityTable({ tenantId }: { tenantId: number }) {
  const { data, isLoading, error } = useTenantAcademyStaffStats(tenantId);

  return (
    <Card>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-destructive">
            Failed to load Academy activity.
          </div>
        ) : !data || data.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No staff Academy activity yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name / email</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead className="text-right">Logins (90d)</TableHead>
                <TableHead>Courses</TableHead>
                <TableHead className="text-right">PD hours completed</TableHead>
                <TableHead className="text-right">Certificates earned</TableHead>
                <TableHead>Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.user_id}>
                  <TableCell>
                    <div className="font-medium">{r.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.email || "—"}
                    </div>
                  </TableCell>
                  <TableCell>{fmtRelative(r.last_login_at, "Never")}</TableCell>
                  <TableCell className="text-right">
                    {Number(r.login_count_90d ?? 0)}
                  </TableCell>
                  <TableCell className="text-sm">{formatCourseBreakdown(r)}</TableCell>
                  <TableCell className="text-right">
                    {numberAU.format(Number(r.pd_hours_completed ?? 0))}
                  </TableCell>
                  <TableCell className="text-right">
                    {Number(r.certificates_earned ?? 0)}
                  </TableCell>
                  <TableCell>
                    {fmtRelative(r.last_activity_at, "No activity yet")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function StaffDrawer({
  state,
  onOpenChange,
}: {
  state: DrawerState;
  onOpenChange: (open: boolean) => void;
}) {
  const row = state.row;
  const cycleQuery = useQuery({
    queryKey: ["pdp", "tenant-staff-cycle-lookup", row?.user_id ?? null, row?.tenant_id ?? null],
    queryFn: () => getCurrentCycle(row!.user_id, row!.tenant_id),
    enabled: !!row,
    staleTime: 30_000,
  });
  const cycleId = cycleQuery.data?.id ?? null;
  const summary = useCycleSummary(cycleId);

  return (
    <Sheet open={!!row} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {row && (
          <>
            <SheetHeader>
              <SheetTitle>{row.staff_name}</SheetTitle>
              <SheetDescription>
                {row.audience_code ?? "—"} · Cycle {row.cycle_year ?? "—"}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              <div className="flex items-center gap-3">
                <CurrencyStatusPill status={row.currency_status} />
                <span className="text-sm text-muted-foreground">
                  Cycle ends {fmtDate(row.cycle_end_date)}
                </span>
              </div>

              <div className="rounded-md border p-4 space-y-3">
                {cycleQuery.isLoading || summary.isLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : summary.data ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Target hours</span>
                      <span className="font-medium">
                        {numberAU.format(Number(summary.data.target_pd_hours ?? 0))}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Actual hours</span>
                      <span className="font-medium">
                        {numberAU.format(Number(summary.data.actual_pd_hours ?? 0))}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">% complete</span>
                      <span className="font-medium">
                        {Math.round(Number(summary.data.percent_complete ?? 0))}%
                      </span>
                    </div>
                    <Progress
                      value={Math.min(
                        100,
                        Math.round(Number(summary.data.percent_complete ?? 0)),
                      )}
                    />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Cycle summary unavailable.</p>
                )}
              </div>

              {cycleId !== null && (
                <Button asChild className="w-full">
                  <Link to={`/academy/pdp/cycle/${cycleId}`}>View PDP</Link>
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function StaffPdpsPage() {
  const {
    activeTenantId,
    canManagePortalUsers,
    tenantUserLoading,
  } = useClientTenant();
  const { data, isLoading, error } = useWorkforcePdp();
  const [params, setParams] = useSearchParams();
  const [drawer, setDrawer] = useState<DrawerState>({ row: null });

  const audienceFilter = params.get("audience") ?? "";
  const yearFilter = params.get("year") ?? "";
  const statusFilter = useMemo(
    () => (params.get("status") ?? "").split(",").filter(Boolean) as CurrencyStatus[],
    [params],
  );

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (!value) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  // Defence-in-depth: scope to active tenant even though RLS already does so.
  const tenantRows = useMemo<WorkforcePdpRow[]>(() => {
    if (!data || activeTenantId == null) return [];
    return data.filter((r) => r.tenant_id === activeTenantId);
  }, [data, activeTenantId]);

  const audienceOptions = useMemo(
    () =>
      Array.from(
        new Set(tenantRows.map((r) => r.audience_code).filter((v): v is string => !!v)),
      ).sort(),
    [tenantRows],
  );

  const yearOptions = useMemo(
    () =>
      Array.from(
        new Set(tenantRows.map((r) => r.cycle_year).filter((v): v is number => v !== null)),
      ).sort((a, b) => b - a),
    [tenantRows],
  );

  const filtered = useMemo(() => {
    const set = new Set(statusFilter);
    return tenantRows
      .filter((r) => {
        if (audienceFilter && r.audience_code !== audienceFilter) return false;
        if (yearFilter && String(r.cycle_year ?? "") !== yearFilter) return false;
        if (set.size > 0 && !set.has(r.currency_status)) return false;
        return true;
      })
      .sort((a, b) => {
        const r = STATUS_RANK[a.currency_status] - STATUS_RANK[b.currency_status];
        if (r !== 0) return r;
        const ad = a.cycle_end_date ?? "9999-12-31";
        const bd = b.cycle_end_date ?? "9999-12-31";
        return ad.localeCompare(bd);
      });
  }, [tenantRows, audienceFilter, yearFilter, statusFilter]);

  const total = filtered.length;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  const counts = useMemo(() => {
    let current = 0;
    let atRisk = 0;
    let overdue = 0;
    for (const r of filtered) {
      if (r.currency_status === "current") current++;
      else if (r.currency_status === "at_risk") atRisk++;
      else if (r.currency_status === "overdue") overdue++;
    }
    return { current, atRisk, overdue };
  }, [filtered]);

  function toggleStatus(s: CurrencyStatus) {
    const next = new Set(statusFilter);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    setParam("status", next.size ? Array.from(next).join(",") : null);
  }

  function clearFilters() {
    setParams(new URLSearchParams(), { replace: true });
  }

  const hasFilters = !!(audienceFilter || yearFilter || statusFilter.length);

  // Resolution / access gates
  if (tenantUserLoading || activeTenantId == null) {
    return (
      <div className="container mx-auto p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!canManagePortalUsers) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <h1 className="text-lg font-semibold">You don't have access to this page</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Staff PDPs are visible to your organisation's primary or secondary contact.
              Please contact them if you need access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Staff PDPs</h1>
          <p className="text-sm text-muted-foreground">
            PDP cycles and Vivacity Academy activity for your team.
          </p>
        </div>

        <Tabs defaultValue="pdp-cycles">
          <TabsList>
            <TabsTrigger value="pdp-cycles">PDP cycles</TabsTrigger>
            <TabsTrigger value="academy-activity">Academy activity</TabsTrigger>
          </TabsList>

          <TabsContent value="pdp-cycles" className="space-y-6 mt-6">
            {/* Filter bar */}
            <Card>
              <CardContent className="p-4 flex flex-wrap items-center gap-3">
                <div className="min-w-[180px]">
                  <Select
                    value={audienceFilter || NONE}
                    onValueChange={(v) => setParam("audience", v === NONE ? null : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Audience" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>All audiences</SelectItem>
                      {audienceOptions.map((a) => (
                        <SelectItem key={a} value={a}>
                          {a}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="min-w-[180px] justify-between">
                      {statusFilter.length === 0
                        ? "Currency status"
                        : `${statusFilter.length} selected`}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56" align="start">
                    <div className="space-y-2">
                      {ALL_STATUSES.map((s) => (
                        <label key={s} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={statusFilter.includes(s)}
                            onCheckedChange={() => toggleStatus(s)}
                          />
                          <span className="text-sm">{STATUS_LABEL[s]}</span>
                        </label>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                <div className="min-w-[140px]">
                  <Select
                    value={yearFilter || NONE}
                    onValueChange={(v) => setParam("year", v === NONE ? null : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Cycle year" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>All years</SelectItem>
                      {yearOptions.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* KPI tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">Total staff</div>
                  <div className="text-2xl font-bold mt-1">{total}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">% Current</div>
                  <div className="text-2xl font-bold mt-1">{pct(counts.current)}%</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">% At risk</div>
                  <div className="text-2xl font-bold mt-1">{pct(counts.atRisk)}%</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">% Overdue</div>
                  <div className="text-2xl font-bold mt-1">{pct(counts.overdue)}%</div>
                </CardContent>
              </Card>
            </div>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-6 space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : error ? (
                  <div className="p-6 text-sm text-destructive">
                    Failed to load staff PDP data.
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground">No matching staff.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Staff name</TableHead>
                        <TableHead>Audience</TableHead>
                        <TableHead className="text-right">Cycle year</TableHead>
                        <TableHead className="text-right">Target hrs</TableHead>
                        <TableHead className="text-right">Actual hrs</TableHead>
                        <TableHead className="w-[140px]">% complete</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Cycle end</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((r) => {
                        const pctC = Math.min(100, Math.round(r.percent_complete));
                        return (
                          <TableRow
                            key={`${r.user_id}-${r.tenant_id ?? "null"}`}
                            className="cursor-pointer"
                            onClick={() => setDrawer({ row: r })}
                          >
                            <TableCell className="font-medium">{r.staff_name}</TableCell>
                            <TableCell>{r.audience_code ?? "—"}</TableCell>
                            <TableCell className="text-right">{r.cycle_year ?? "—"}</TableCell>
                            <TableCell className="text-right">
                              {numberAU.format(r.target_pd_hours)}
                            </TableCell>
                            <TableCell className="text-right">
                              {numberAU.format(r.actual_pd_hours)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={pctC} className="h-2" />
                                <span className="text-xs w-10 text-right">{pctC}%</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <CurrencyStatusPill status={r.currency_status} />
                            </TableCell>
                            <TableCell>{fmtDate(r.cycle_end_date)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Footer action — export stub */}
            <div className="flex justify-end">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button variant="outline" disabled>
                      <Download className="h-4 w-4 mr-2" />
                      Export audit pack
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Coming soon</TooltipContent>
              </Tooltip>
            </div>
          </TabsContent>

          <TabsContent value="academy-activity" className="mt-6">
            <AcademyStaffActivityTable tenantId={activeTenantId} />
          </TabsContent>
        </Tabs>
      </div>

      <StaffDrawer
        state={drawer}
        onOpenChange={(open) => {
          if (!open) setDrawer({ row: null });
        }}
      />
    </TooltipProvider>
  );
}
