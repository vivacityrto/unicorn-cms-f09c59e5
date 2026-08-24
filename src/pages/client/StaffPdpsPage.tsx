import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChevronDown, Download, Loader2, MoreHorizontal, Sparkles, AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import { CurrencyStatusPill } from "@/components/academy/pdp/CurrencyStatusPill";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useWorkforcePdp } from "@/features/pdp/useWorkforcePdp";
import { useCycleSummary } from "@/features/pdp/hooks";
import { getCurrentCycle } from "@/features/pdp/api";
import { exportPdpAuditPack, resolveTenantName } from "@/features/pdp/exportAuditPack";
import type { WorkforcePdpRow } from "@/features/pdp/workforce";
import type { CurrencyStatus } from "@/features/pdp/types";
import { AcademyActivityDashboard } from "@/components/client/AcademyActivityDashboard";

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

interface DrawerState {
  row: WorkforcePdpRow | null;
}

function StaffPdpOverview({ rows }: { rows: WorkforcePdpRow[] }) {
  const current = rows.filter((row) => row.currency_status === "current" || row.currency_status === "on_track").length;
  const atRisk = rows.filter((row) => row.currency_status === "at_risk").length;
  const overdue = rows.filter((row) => row.currency_status === "overdue").length;
  const needsAction = rows
    .filter((row) => row.currency_status === "overdue" || row.currency_status === "at_risk")
    .sort((a, b) => (a.cycle_end_date ?? "9999-12-31").localeCompare(b.cycle_end_date ?? "9999-12-31"));
  const percentage = rows.length ? Math.round((current / rows.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-5"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Staff with a PDP</p><p className="mt-2 text-2xl font-semibold">{rows.length}</p><p className="mt-1 text-xs text-muted-foreground">Across the current cycle</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current / on track</p><p className="mt-2 text-2xl font-semibold text-emerald-700">{percentage}%</p><p className="mt-1 text-xs text-muted-foreground">{current} staff in good standing</p></CardContent></Card>
        <Card className={atRisk ? "border-amber-300" : undefined}><CardContent className="p-5"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Needs attention</p><p className="mt-2 text-2xl font-semibold text-amber-700">{atRisk}</p><p className="mt-1 text-xs text-muted-foreground">At-risk cycles</p></CardContent></Card>
        <Card className={overdue ? "border-destructive/30" : undefined}><CardContent className="p-5"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Overdue</p><p className="mt-2 text-2xl font-semibold text-destructive">{overdue}</p><p className="mt-1 text-xs text-muted-foreground">Cycles needing follow-up</p></CardContent></Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card><CardContent className="p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold">PDP health</h2><p className="text-sm text-muted-foreground">A quick view of development progress across your team.</p></div><CheckCircle2 className="h-5 w-5 text-primary" /></div><div className="mt-5"><div className="mb-2 flex justify-between text-sm"><span className="text-muted-foreground">Current or on track</span><span className="font-medium">{current} of {rows.length}</span></div><Progress value={percentage} className="h-2" /></div></CardContent></Card>
        <Card className={needsAction.length ? "border-amber-300" : undefined}><CardContent className="p-5"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /><h2 className="text-base font-semibold">Action queue</h2></div>{needsAction.length ? <div className="mt-4 space-y-3">{needsAction.slice(0, 3).map((row) => <Link key={`${row.user_id}-${row.tenant_id}`} to="/client/staff-pdps" className="block rounded-lg border bg-amber-50/50 p-3 transition-colors hover:bg-amber-50"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{row.staff_name}</span><span className="text-xs font-medium text-amber-700">{row.currency_status === "overdue" ? "Overdue" : "At risk"}</span></div><p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3 w-3" />{Math.round(Number(row.percent_complete ?? 0))}% complete · cycle ends {fmtDate(row.cycle_end_date)}</p></Link>)}</div> : <p className="mt-3 text-sm text-muted-foreground">No PDP actions need attention right now.</p>}</CardContent></Card>
      </div>
    </div>
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
  const { data, isLoading, error } = useWorkforcePdp(activeTenantId);
  const [params, setParams] = useSearchParams();
  const [drawer, setDrawer] = useState<DrawerState>({ row: null });
  const [exportingKey, setExportingKey] = useState<string | null>(null);

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

  // Defence-in-depth: scope to active tenant even though the query already filters.
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
      // Current tile = good standing (literal current OR mid-cycle on_track).
      if (r.currency_status === "current" || r.currency_status === "on_track") current++;
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
  const noPdpCycleYet = !isLoading && !error && tenantRows.length === 0;

  async function handleExport(opts?: { userId: string; staffName: string }) {
    if (activeTenantId == null) return;
    const key = opts?.userId ?? "tenant";
    setExportingKey(key);
    try {
      const tenantName = await resolveTenantName(
        activeTenantId,
        tenantRows[0]?.tenant_name,
      );
      const result = await exportPdpAuditPack({
        tenantId: activeTenantId,
        tenantName,
        userId: opts?.userId,
        staffName: opts?.staffName,
      });
      toast.success(
        result.staff_count === 1
          ? "Audit pack ready — 1 staff exported."
          : `Audit pack ready — ${result.staff_count} staff exported.`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed";
      toast.error(msg);
    } finally {
      setExportingKey(null);
    }
  }

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
          <p className="text-sm text-muted-foreground">A decision-ready view of your team&apos;s development progress.</p>
        </div>

        {!isLoading && !error && tenantRows.length > 0 && <StaffPdpOverview rows={tenantRows} />}

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
                    disabled={noPdpCycleYet}
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
                    <Button
                      variant="outline"
                      className="min-w-[180px] justify-between"
                      disabled={noPdpCycleYet}
                    >
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
                    disabled={noPdpCycleYet}
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

            {isLoading ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i}>
                      <CardContent className="p-4">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-8 w-16 mt-2" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Card>
                  <CardContent className="p-6 space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </CardContent>
                </Card>
              </>
            ) : error ? (
              <Card>
                <CardContent className="p-6 text-sm text-destructive">
                  Failed to load staff PDP data.
                </CardContent>
              </Card>
            ) : noPdpCycleYet ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center space-y-3">
                  <Sparkles className="h-8 w-8 mx-auto text-[var(--viv-purple)]" />
                  <h3 className="text-lg font-semibold text-foreground">No PDP cycle yet</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Staff in this organisation haven&apos;t started a PDP cycle yet. Currency
                    tiles and the staff table will appear once the first cycle is created.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
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
                    {filtered.length === 0 ? (
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
                            <TableHead className="w-[56px]">
                              <span className="sr-only">Actions</span>
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filtered.map((r) => {
                            const pctC = Math.min(100, Math.round(r.percent_complete));
                            const rowExporting = exportingKey === r.user_id;
                            return (
                              <TableRow
                                key={`${r.user_id}-${r.tenant_id ?? "null"}`}
                                className="cursor-pointer"
                                onClick={() => setDrawer({ row: r })}
                              >
                                <TableCell className="font-medium">{r.staff_name}</TableCell>
                                <TableCell>{r.audience_code ?? "—"}</TableCell>
                                <TableCell className="text-right">
                                  {r.cycle_year ?? "—"}
                                </TableCell>
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
                                <TableCell>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        disabled={exportingKey !== null}
                                        onClick={(e) => e.stopPropagation()}
                                        aria-label={`Actions for ${r.staff_name}`}
                                      >
                                        {rowExporting ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <MoreHorizontal className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent
                                      align="end"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <DropdownMenuItem
                                        onClick={() =>
                                          void handleExport({
                                            userId: r.user_id,
                                            staffName: r.staff_name,
                                          })
                                        }
                                      >
                                        <Download className="h-4 w-4 mr-2" />
                                        Export audit pack
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {/* Footer action */}
            <div className="flex justify-end">
              <Button
                variant="outline"
                disabled={noPdpCycleYet || isLoading || !!error || exportingKey !== null}
                onClick={() => void handleExport()}
              >
                {exportingKey === "tenant" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Export audit pack
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="academy-activity" className="mt-6">
            <AcademyActivityDashboard tenantId={activeTenantId} />
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
