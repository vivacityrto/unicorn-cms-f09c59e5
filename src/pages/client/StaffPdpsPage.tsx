import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Download, Loader2, MoreHorizontal, Sparkles, AlertTriangle } from "lucide-react";
import { CurrencyStatusPill } from "@/components/academy/pdp/CurrencyStatusPill";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useWorkforcePdp } from "@/features/pdp/useWorkforcePdp";
import { useCycleSummary } from "@/features/pdp/hooks";
import { getCurrentCycle } from "@/features/pdp/api";
import { exportPdpAuditPack, resolveTenantName } from "@/features/pdp/exportAuditPack";
import type { WorkforcePdpRow } from "@/features/pdp/workforce";
import type { CurrencyStatus } from "@/features/pdp/types";
import {
  compareRows,
  daysLeft,
  parseStatusParam,
  pctClamped,
  STATUS_LABEL,
  summariseStaffPdps,
} from "@/components/client/staff-pdp/staffPdpInsights";
import {
  PaceBar,
  StaffPdpFilterCards,
  StaffPdpInsightPanel,
  StaffPdpsBanner,
  gapLabel,
  hoursLabel,
  type PdpCard,
} from "@/components/client/staff-pdp/StaffPdpsOverview";

const NONE = "__none__";
/** fetchWorkforcePdp stops at this many rows. */
const ROW_LIMIT = 2000;

const CARD_STATUSES: Record<PdpCard, CurrencyStatus[]> = {
  all: [],
  attention: ["overdue", "at_risk"],
  on_track: ["on_track"],
  current: ["current"],
};

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

function endsIn(row: WorkforcePdpRow): string {
  const d = daysLeft(row);
  if (d === null) return "No end date";
  if (d === 0) return "Today";
  if (d > 0) return `in ${d} ${d === 1 ? "day" : "days"}`;
  return `${-d} ${d === -1 ? "day" : "days"} ago`;
}

const sameSet = (a: CurrencyStatus[], b: CurrencyStatus[]) => a.length === b.length && a.every((x) => b.includes(x));

interface DrawerState {
  row: WorkforcePdpRow | null;
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
  const pct = summary.data ? pctClamped({ percent_complete: Number(summary.data.percent_complete ?? 0) }) : 0;

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
                  Cycle ends {fmtDate(row.cycle_end_date)} ({endsIn(row)})
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
                      <span className="font-medium">{pct}%</span>
                    </div>
                    <Progress value={pct} />
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
  const [exporting, setExporting] = useState<{ kind: "tenant" } | { kind: "user"; userId: string } | null>(null);

  const statusFilter = useMemo(() => parseStatusParam(params.get("status")), [params]);

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

  // A bookmarked audience or year that no longer exists is ignored rather than hiding every row.
  const rawAudience = params.get("audience") ?? "";
  const rawYear = params.get("year") ?? "";
  const audienceFilter = audienceOptions.includes(rawAudience) ? rawAudience : "";
  const yearFilter = yearOptions.some((y) => String(y) === rawYear) ? rawYear : "";

  // Everything on the page (cards, charts, table) is worked out from the same audience and year selection.
  const scoped = useMemo(
    () =>
      tenantRows.filter((r) => {
        if (audienceFilter && r.audience_code !== audienceFilter) return false;
        if (yearFilter && String(r.cycle_year ?? "") !== yearFilter) return false;
        return true;
      }),
    [tenantRows, audienceFilter, yearFilter],
  );
  const summary = useMemo(() => summariseStaffPdps(scoped), [scoped]);

  const shown = useMemo(() => {
    const set = new Set(statusFilter);
    return scoped.filter((r) => set.size === 0 || set.has(r.currency_status)).sort(compareRows);
  }, [scoped, statusFilter]);

  const activeCard = (Object.keys(CARD_STATUSES) as PdpCard[]).find((k) => sameSet(CARD_STATUSES[k], statusFilter)) ?? ("" as PdpCard);

  function clearFilters() {
    setParams(new URLSearchParams(), { replace: true });
  }

  const hasFilters = !!(audienceFilter || yearFilter || statusFilter.length);
  const noPdpCycleYet = !isLoading && !error && tenantRows.length === 0;

  async function handleExport(opts?: { userId: string; staffName: string }) {
    if (activeTenantId == null) return;
    setExporting(opts ? { kind: "user", userId: opts.userId } : { kind: "tenant" });
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
      setExporting(null);
    }
  }

  // Resolution / access gates
  if (tenantUserLoading || activeTenantId == null) {
    return (
      <div className="w-full min-w-0 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!canManagePortalUsers) {
    return (
      <div className="w-full min-w-0">
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

  const pillTrigger =
    "h-9 w-auto min-w-[140px] gap-2 rounded-full border-white/40 bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/20 focus:ring-white disabled:opacity-60 [&>svg]:text-white";

  const controls = (
    <>
      <Select value={audienceFilter || NONE} onValueChange={(v) => setParam("audience", v === NONE ? null : v)} disabled={noPdpCycleYet}>
        <SelectTrigger className={pillTrigger} aria-label="Audience">
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
      <Select value={yearFilter || NONE} onValueChange={(v) => setParam("year", v === NONE ? null : v)} disabled={noPdpCycleYet}>
        <SelectTrigger className={pillTrigger} aria-label="Cycle year">
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
      <Button
        variant="secondary"
        size="sm"
        className="h-9 rounded-full"
        disabled={noPdpCycleYet || isLoading || !!error || exporting !== null}
        onClick={() => void handleExport()}
        title="Exports every person in your organisation, whatever is filtered here."
      >
        {exporting?.kind === "tenant" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
        Export audit pack
      </Button>
    </>
  );

  return (
    <TooltipProvider>
      <div className="w-full min-w-0 space-y-4">
        {isLoading ? (
          <>
            <Skeleton className="h-28 w-full rounded-2xl" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-64 w-full rounded-xl" />
          </>
        ) : (
          <>
            <StaffPdpsBanner summary={summary} controls={controls} />

            {error ? (
              <Card>
                <CardContent className="p-6 text-sm text-destructive">
                  Failed to load staff PDP data. Refresh the page to try again.
                </CardContent>
              </Card>
            ) : noPdpCycleYet ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center space-y-3">
                  <Sparkles className="h-8 w-8 mx-auto text-[var(--viv-purple)]" />
                  <h3 className="text-lg font-semibold text-foreground">No PDP cycle yet</h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Staff in this organisation haven&apos;t started a PDP cycle yet. The cards, charts and staff table will appear once the first cycle is created.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {(data?.length ?? 0) >= ROW_LIMIT && (
                  <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    Showing the first {ROW_LIMIT.toLocaleString("en-AU")} people. Some may be missing from these figures.
                  </div>
                )}

                <StaffPdpFilterCards summary={summary} active={activeCard} onSelect={(c) => setParam("status", CARD_STATUSES[c].length ? CARD_STATUSES[c].join(",") : null)} />

                <StaffPdpInsightPanel summary={summary} onOpen={(row) => setDrawer({ row })} />

                <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>
                    {statusFilter.length > 0 ? `Showing ${statusFilter.map((s) => STATUS_LABEL[s].toLowerCase()).join(" and ")}: ` : "Showing everyone: "}
                    {shown.length} of {scoped.length}
                  </span>
                  {hasFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  )}
                </div>

                <Card>
                  <CardContent className="p-0">
                    {shown.length === 0 ? (
                      <div className="flex flex-col items-start gap-2 p-6 text-sm text-muted-foreground">
                        No matching staff.
                        {hasFilters && (
                          <Button variant="outline" size="sm" onClick={clearFilters}>
                            Clear filters
                          </Button>
                        )}
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Staff</TableHead>
                            <TableHead className="w-[26%] min-w-[180px]">
                              Progress <span className="font-normal text-muted-foreground">(tick = time passed)</span>
                            </TableHead>
                            <TableHead className="hidden md:table-cell">Hours</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="hidden sm:table-cell">Cycle ends</TableHead>
                            <TableHead className="w-[56px]">
                              <span className="sr-only">Actions</span>
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {shown.map((r) => {
                            const rowExporting = exporting?.kind === "user" && exporting.userId === r.user_id;
                            return (
                              <TableRow
                                key={`${r.user_id}-${r.tenant_id ?? "null"}-${r.cycle_year ?? "x"}`}
                                className="cursor-pointer"
                                onClick={() => setDrawer({ row: r })}
                              >
                                <TableCell>
                                  <div className="font-medium">{r.staff_name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {r.audience_code ?? "No audience"} · Cycle {r.cycle_year ?? "—"}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <PaceBar row={r} />
                                </TableCell>
                                <TableCell className="hidden md:table-cell">
                                  <div className="tabular-nums">{hoursLabel(r)}</div>
                                  <div className="text-xs text-muted-foreground">{gapLabel(r)}</div>
                                </TableCell>
                                <TableCell>
                                  <CurrencyStatusPill status={r.currency_status} />
                                </TableCell>
                                <TableCell className="hidden sm:table-cell">
                                  <div>{endsIn(r)}</div>
                                  <div className="text-xs text-muted-foreground">{fmtDate(r.cycle_end_date)}</div>
                                </TableCell>
                                <TableCell>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        disabled={exporting !== null}
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
          </>
        )}
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
