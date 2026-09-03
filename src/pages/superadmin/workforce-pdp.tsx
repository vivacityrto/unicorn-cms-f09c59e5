import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, ChevronDown } from "lucide-react";
import { CurrencyStatusPill } from "@/components/academy/pdp/CurrencyStatusPill";
import { useWorkforcePdp } from "@/features/pdp/useWorkforcePdp";
import { useCycleSummary } from "@/features/pdp/hooks";
import { getCurrentCycle } from "@/features/pdp/api";
import type { WorkforcePdpRow } from "@/features/pdp/workforce";
import type { CurrencyStatus } from "@/features/pdp/types";
import { useQuery } from "@tanstack/react-query";

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

function downloadCsv(rows: WorkforcePdpRow[]) {
  const csv = Papa.unparse(
    rows.map((r) => ({
      "Staff name": r.staff_name,
      Email: r.staff_email ?? "",
      Tenant: r.tenant_name,
      Audience: r.audience_code ?? "",
      "Cycle year": r.cycle_year ?? "",
      "Target hours": numberAU.format(r.target_pd_hours),
      "Actual hours": numberAU.format(r.actual_pd_hours),
      "% complete": Math.round(r.percent_complete),
      "Currency status": STATUS_LABEL[r.currency_status],
      "Cycle end": fmtDate(r.cycle_end_date),
    })),
  );
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `workforce-pdp-${format(new Date(), "yyyyMMdd")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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
    queryKey: ["pdp", "workforce-cycle-lookup", row?.user_id ?? null, row?.tenant_id ?? null],
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
                {row.tenant_name} · {row.audience_code ?? "—"} · Cycle {row.cycle_year ?? "—"}
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
                      value={Math.min(100, Math.round(Number(summary.data.percent_complete ?? 0)))}
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

export default function SuperAdminWorkforcePdp() {
  const { data, isLoading, error } = useWorkforcePdp();
  const [params, setParams] = useSearchParams();
  const [drawer, setDrawer] = useState<DrawerState>({ row: null });

  const tenantFilter = params.get("tenant") ?? "";
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

  const rows = useMemo(() => data ?? [], [data]);

  const tenantOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      const id = r.tenant_id === null ? "null" : String(r.tenant_id);
      if (!map.has(id)) map.set(id, r.tenant_name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const audienceOptions = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.audience_code).filter((v): v is string => !!v))).sort();
  }, [rows]);

  const yearOptions = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.cycle_year).filter((v): v is number => v !== null))).sort(
      (a, b) => b - a,
    );
  }, [rows]);

  const filtered = useMemo(() => {
    const set = new Set(statusFilter);
    return rows
      .filter((r) => {
        if (tenantFilter) {
          const id = r.tenant_id === null ? "null" : String(r.tenant_id);
          if (id !== tenantFilter) return false;
        }
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
  }, [rows, tenantFilter, audienceFilter, yearFilter, statusFilter]);

  const total = filtered.length;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  const counts = useMemo(() => {
    let current = 0,
      atRisk = 0,
      overdue = 0;
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

  const hasFilters = !!(tenantFilter || audienceFilter || yearFilter || statusFilter.length);

  return (
    <>
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Workforce PDP</h1>
          <p className="text-sm text-muted-foreground">
            Latest PDP cycle per staff member across all tenants.
          </p>
        </div>

        {/* Filter bar */}
        <Card>
          <CardContent className="p-4 flex flex-wrap items-center gap-3">
            <div className="min-w-[200px]">
              <Select
                value={tenantFilter || NONE}
                onValueChange={(v) => setParam("tenant", v === NONE ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Tenant" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>All tenants</SelectItem>
                  {tenantOptions.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[180px]">
              <Select
                value={audienceFilter || NONE}
                onValueChange={(v) => setParam("audience", v === NONE ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="Audience" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>All audiences</SelectItem>
                  {audienceOptions.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
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
                <SelectTrigger><SelectValue placeholder="Cycle year" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>All years</SelectItem>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
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
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Staff under management</div>
            <div className="text-2xl font-bold mt-1">{total}</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">% Current</div>
            <div className="text-2xl font-bold mt-1">{pct(counts.current)}%</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">% At risk</div>
            <div className="text-2xl font-bold mt-1">{pct(counts.atRisk)}%</div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">% Overdue</div>
            <div className="text-2xl font-bold mt-1">{pct(counts.overdue)}%</div>
          </CardContent></Card>
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
                Failed to load workforce PDP data.
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No matching staff.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff name</TableHead>
                    <TableHead>Tenant</TableHead>
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
                        <TableCell>{r.tenant_name}</TableCell>
                        <TableCell>{r.audience_code ?? "—"}</TableCell>
                        <TableCell className="text-right">{r.cycle_year ?? "—"}</TableCell>
                        <TableCell className="text-right">{numberAU.format(r.target_pd_hours)}</TableCell>
                        <TableCell className="text-right">{numberAU.format(r.actual_pd_hours)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={pctC} className="h-2" />
                            <span className="text-xs w-10 text-right">{pctC}%</span>
                          </div>
                        </TableCell>
                        <TableCell><CurrencyStatusPill status={r.currency_status} /></TableCell>
                        <TableCell>{fmtDate(r.cycle_end_date)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Footer action */}
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => downloadCsv(filtered)}
            disabled={filtered.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export to CSV
          </Button>
        </div>
      </div>

      <StaffDrawer
        state={drawer}
        onOpenChange={(open) => {
          if (!open) setDrawer({ row: null });
        }}
      />
    </>
  );
}
