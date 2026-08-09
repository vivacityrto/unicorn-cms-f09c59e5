import { useState, useMemo, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEnumLabel } from "@/lib/eosOptionLabels";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import {
  Search, Plus, MoreHorizontal, Eye, CalendarIcon, XCircle,
  RefreshCw, Users, CheckCircle, Clock, Ban, Download, Sparkles, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AcademyStatCard from "@/components/academy/admin/AcademyStatCard";
import CourseProgressBar from "@/components/academy/admin/CourseProgressBar";
import EnrolmentProgressDrawer from "@/components/academy/admin/EnrolmentProgressDrawer";
import NewEnrolmentModal from "@/components/academy/admin/NewEnrolmentModal";
import {
  useAdminEnrollments,
  useEnrollmentProgress,
  useEnrollmentFilterOptions,
  useEnrollmentStats,
  useRevokeEnrollment,
  useReactivateEnrollment,
  useExtendEnrollment,
  useEnrollmentRealtime,
} from "@/hooks/academy/useAcademyEnrollments";
import { usePermission } from "@/hooks/usePermission";

type StatusFilter = "all" | "active" | "completed" | "expired" | "revoked";
const SOURCE_VALUES = ["manual", "auto_package", "auto_package_backfill"] as const;
type SourceValue = (typeof SOURCE_VALUES)[number];

const sourceTone = (s?: string | null) => {
  if (s === "manual") return "bg-slate-100 text-slate-700 border-slate-200";
  if (s === "auto_package") return "bg-purple-100 text-purple-700 border-purple-200";
  if (s === "auto_package_backfill") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-muted text-muted-foreground";
};

const sourceLabel = (s?: string | null) => {
  if (!s) return "—";
  return String(s).replace(/_/g, " ");
};

export default function AcademyEnrolmentsPage() {
  useEnrollmentRealtime();

  const [searchParams, setSearchParams] = useSearchParams();

  // ── URL-state filters ──
  const search = searchParams.get("search") ?? "";
  const courseFilter = searchParams.get("course") ?? "all";
  const tenantFilter = searchParams.get("tenant") ?? "all";
  const statusFilter = (searchParams.get("status") as StatusFilter) || "all";
  const fromDate = searchParams.get("from") ?? "";
  const toDate = searchParams.get("to") ?? "";
  const sourceParam = searchParams.get("source") ?? "";
  const selectedSources = useMemo<Set<SourceValue>>(() => {
    if (!sourceParam) return new Set();
    return new Set(sourceParam.split(",").filter((s): s is SourceValue => SOURCE_VALUES.includes(s as SourceValue)));
  }, [sourceParam]);

  const setParam = useCallback((key: string, value: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === null || value === "" || value === "all") next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const toggleSource = (s: SourceValue) => {
    const next = new Set(selectedSources);
    next.has(s) ? next.delete(s) : next.add(s);
    setParam("source", next.size ? Array.from(next).join(",") : null);
  };

  const clearFilters = () => {
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  // ── Local UI state ──
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [revokeTarget, setRevokeTarget] = useState<number | null>(null);
  const [extendTarget, setExtendTarget] = useState<number | null>(null);
  const [extendDate, setExtendDate] = useState<Date | undefined>();
  const [bulkExtendOpen, setBulkExtendOpen] = useState(false);
  const [bulkExtendDate, setBulkExtendDate] = useState<Date | undefined>();
  const [bulkRevokeOpen, setBulkRevokeOpen] = useState(false);
  const [drawerEnrolmentId, setDrawerEnrolmentId] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  // ── Data hooks ──
  const { data: enrolments, isLoading } = useAdminEnrollments();
  const { data: progressMap = new Map() } = useEnrollmentProgress();
  const { courses, tenants } = useEnrollmentFilterOptions();
  const { data: stats, isLoading: loadingStats } = useEnrollmentStats();
  const revokeMutation = useRevokeEnrollment();
  const reactivateMutation = useReactivateEnrollment();
  const extendMutation = useExtendEnrollment();

  // ── RBAC gates ──
  const canCreateEnrolment = usePermission('academy.enrolments.create');
  const canExportCSV = usePermission('academy.enrolments.revoke', 'full');
  const canManageEnrolments = usePermission('academy.enrolments.revoke');

  // Compute "expired" client-side (status='active' AND expires_at <= now())
  const isExpired = (e: any) =>
    e.status === "active" && e.expires_at && new Date(e.expires_at).getTime() <= Date.now();

  // Filter enrolments
  const filtered = useMemo(() => {
    if (!enrolments) return [];
    return enrolments.filter((e: any) => {
      // Status (special: 'expired' is derived)
      if (statusFilter === "expired") {
        if (!isExpired(e)) return false;
      } else if (statusFilter !== "all") {
        if (e.status !== statusFilter) return false;
        // When filtering by "active", exclude expired ones
        if (statusFilter === "active" && isExpired(e)) return false;
      }
      if (selectedSources.size > 0 && !selectedSources.has(e.source)) return false;
      if (courseFilter !== "all" && String(e.course_id) !== courseFilter) return false;
      if (tenantFilter !== "all" && String(e.tenant_id) !== tenantFilter) return false;
      if (fromDate && e.enrolled_at && new Date(e.enrolled_at) < new Date(fromDate)) return false;
      if (toDate && e.enrolled_at && new Date(e.enrolled_at) > new Date(toDate + "T23:59:59")) return false;
      if (search) {
        const s = search.toLowerCase();
        const userName = `${e.user?.first_name || ""} ${e.user?.last_name || ""}`.toLowerCase();
        const email = (e.user?.email || "").toLowerCase();
        const tenantName = (e.tenant?.name || "").toLowerCase();
        if (!userName.includes(s) && !email.includes(s) && !tenantName.includes(s)) return false;
      }
      return true;
    });
  }, [enrolments, statusFilter, selectedSources, courseFilter, tenantFilter, search, fromDate, toDate]);

  // Status tab counts (derived from full set)
  const tabCounts = useMemo(() => {
    if (!enrolments) return { all: 0, active: 0, completed: 0, expired: 0, revoked: 0 };
    let active = 0, completed = 0, expired = 0, revoked = 0;
    for (const e of enrolments as any[]) {
      const exp = isExpired(e);
      if (exp) expired++;
      if (e.status === "active" && !exp) active++;
      if (e.status === "completed") completed++;
      if (e.status === "revoked" || e.revoked_at) revoked++;
    }
    return { all: enrolments.length, active, completed, expired, revoked };
  }, [enrolments]);

  // Bulk actions
  const handleBulkRevoke = async () => {
    let ok = 0, fail = 0;
    for (const id of selectedIds) {
      try {
        await revokeMutation.mutateAsync({ id });
        ok++;
      } catch {
        fail++;
      }
    }
    setSelectedIds(new Set());
    setBulkRevokeOpen(false);
  };

  const handleBulkExtend = async () => {
    if (!bulkExtendDate) return;
    let ok = 0, fail = 0;
    for (const id of selectedIds) {
      try {
        await extendMutation.mutateAsync({ id, date: bulkExtendDate.toISOString() });
        ok++;
      } catch {
        fail++;
      }
    }
    setSelectedIds(new Set());
    setBulkExtendDate(undefined);
    setBulkExtendOpen(false);
  };

  // CSV export
  const handleExport = (rows: any[]) => {
    if (!rows.length) return;
    const data = rows.map((e: any) => ({
      User: `${e.user?.first_name || ""} ${e.user?.last_name || ""}`.trim(),
      Email: e.user?.email || "",
      Tenant: e.tenant?.name || "",
      TenantType: e.tenant?.tenant_type || "",
      Course: e.course?.title || "",
      Source: e.source || "",
      Status: isExpired(e) ? "expired" : e.status || "",
      Progress: progressMap.get(e.id)?.progress_percentage ?? 0,
      Enrolled: e.enrolled_at ? format(new Date(e.enrolled_at), "yyyy-MM-dd") : "",
      Expires: e.expires_at ? format(new Date(e.expires_at), "yyyy-MM-dd") : "",
    }));
    const headers = Object.keys(data[0]).join(",");
    const escape = (v: any) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers, ...data.map((r) => Object.values(r).map(escape).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `enrolments-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((e: any) => e.id)));
    }
  };

  const statusChip = (e: any) => {
    const expired = isExpired(e);
    const label = expired ? "expired" : e.status || "—";
    let tone = "bg-muted text-muted-foreground";
    if (expired) tone = "bg-red-100 text-red-700";
    else if (e.status === "active") tone = "bg-green-100 text-green-700";
    else if (e.status === "completed") tone = "bg-blue-100 text-blue-700";
    else if (e.status === "revoked") tone = "bg-red-100 text-red-700";
    return (
      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize", tone)}>
        {label}
      </span>
    );
  };

  const filtersActive = !!(search || courseFilter !== "all" || tenantFilter !== "all" ||
    statusFilter !== "all" || fromDate || toDate || selectedSources.size > 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Enrolments</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cross-course view of every Academy enrolment.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canExportCSV && (
              <Button variant="outline" onClick={() => handleExport(filtered)} disabled={!filtered.length}>
                <Download className="h-4 w-4 mr-1" /> Export CSV
              </Button>
            )}
            {canCreateEnrolment && (
              <Button onClick={() => setNewOpen(true)} className="bg-primary text-primary-foreground">
                <Plus className="h-4 w-4 mr-1" /> New Enrolment
              </Button>
            )}
          </div>
        </div>

        {/* 6 stat tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <AcademyStatCard label="Total" value={stats?.total ?? 0} icon={<Users className="h-5 w-5 text-primary" />} loading={loadingStats} />
          <AcademyStatCard label="Active" value={stats?.active ?? 0} icon={<CheckCircle className="h-5 w-5 text-green-600" />} loading={loadingStats} />
          <AcademyStatCard label="Completed" value={stats?.completed ?? 0} icon={<CheckCircle className="h-5 w-5 text-blue-600" />} loading={loadingStats} />
          <AcademyStatCard label="Expired" value={stats?.expired ?? 0} icon={<Clock className="h-5 w-5 text-amber-500" />} loading={loadingStats} />
          <AcademyStatCard label="Revoked" value={stats?.revoked ?? 0} icon={<Ban className="h-5 w-5 text-red-500" />} loading={loadingStats} />
          <AcademyStatCard label="Auto-enrolled (lifetime)" value={stats?.auto_lifetime ?? 0} icon={<Sparkles className="h-5 w-5 text-purple-600" />} loading={loadingStats} />
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search user, email, tenant…"
                  value={search}
                  onChange={(e) => setParam("search", e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={courseFilter} onValueChange={(v) => setParam("course", v)}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Courses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Courses</SelectItem>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={tenantFilter} onValueChange={(v) => setParam("tenant", v)}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Tenants" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tenants</SelectItem>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="font-normal">
                    <CalendarIcon className="h-4 w-4 mr-1" />
                    {fromDate || toDate ? `${fromDate || "…"} → ${toDate || "…"}` : "Enrolled date range"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3 space-y-2" align="start">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">From</label>
                      <Input type="date" value={fromDate} onChange={(e) => setParam("from", e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">To</label>
                      <Input type="date" value={toDate} onChange={(e) => setParam("to", e.target.value)} />
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setParam("from", null); setParam("to", null); }}>
                    Clear dates
                  </Button>
                </PopoverContent>
              </Popover>
            </div>

            {/* Source chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Filter className="h-3 w-3" /> Source:
              </span>
              {SOURCE_VALUES.map((s) => {
                const active = selectedSources.has(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSource(s)}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded-full border transition-colors capitalize",
                      active ? sourceTone(s) : "border-muted text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    {sourceLabel(s)}
                  </button>
                );
              })}
              {filtersActive && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto text-xs">
                  Clear filters
                </Button>
              )}
            </div>

            {/* Status tabs with counts */}
            <div className="flex gap-1 border-b overflow-x-auto">
              {([
                { k: "all", label: "All", count: tabCounts.all },
                { k: "active", label: "Active", count: tabCounts.active },
                { k: "completed", label: "Completed", count: tabCounts.completed },
                { k: "expired", label: "Expired", count: tabCounts.expired },
                { k: "revoked", label: "Revoked", count: tabCounts.revoked },
              ] as const).map((s) => (
                <button
                  key={s.k}
                  onClick={() => setParam("status", s.k)}
                  className={cn(
                    "px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2",
                    statusFilter === s.k
                      ? "text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {s.label}
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{s.count}</Badge>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-muted rounded-lg sticky top-0 z-10">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Button size="sm" variant="destructive" onClick={() => setBulkRevokeOpen(true)}>
              <XCircle className="h-3.5 w-3.5 mr-1" /> Revoke selected
            </Button>
            <Button size="sm" variant="outline" onClick={() => setBulkExtendOpen(true)}>
              <CalendarIcon className="h-3.5 w-3.5 mr-1" /> Extend expiry
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleExport(filtered.filter((e: any) => selectedIds.has(e.id)))}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export selected
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              Clear selection
            </Button>
          </div>
        )}

        {/* Table */}
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filtered.length > 0 && selectedIds.size === filtered.length}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Learner</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Enrolled</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 10 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12">
                      <div className="flex flex-col items-center gap-3">
                        <p className="text-muted-foreground">
                          {filtersActive
                            ? "No enrolments match your filters."
                            : "No enrolments yet. Create one manually, or seed Package → Course rules to auto-enrol."}
                        </p>
                        <div className="flex gap-2">
                          {filtersActive && (
                            <Button variant="outline" size="sm" onClick={clearFilters}>
                              Clear filters
                            </Button>
                          )}
                          {!filtersActive && (
                            <Button variant="outline" size="sm" asChild>
                              <Link to="/superadmin/academy/package-course-rules">
                                Set up Package → Course rules
                              </Link>
                            </Button>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((e: any) => {
                    const prog = progressMap.get(e.id);
                    const expired = isExpired(e);
                    const revoked = e.status === "revoked" || !!e.revoked_at;
                    const expiresSoon = e.expires_at && !expired
                      ? differenceInDays(new Date(e.expires_at), new Date()) < 14
                      : false;
                    return (
                      <TableRow
                        key={e.id}
                        className={cn(
                          expired && "border-l-2 border-l-red-500",
                          revoked && "opacity-60"
                        )}
                      >
                        <TableCell>
                          <Checkbox checked={selectedIds.has(e.id)} onCheckedChange={() => toggleSelect(e.id)} />
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => setDrawerEnrolmentId(e.id)}
                            className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
                          >
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium flex-shrink-0">
                              {e.user?.avatar_url ? (
                                <img src={e.user.avatar_url} className="h-8 w-8 rounded-full object-cover" alt="" />
                              ) : (
                                `${(e.user?.first_name || "?")[0] ?? ""}${(e.user?.last_name || "")[0] ?? ""}`
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className={cn("text-sm font-medium truncate", revoked && "line-through")}>
                                {e.user?.first_name} {e.user?.last_name}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">{e.user?.email}</p>
                            </div>
                          </button>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex flex-col">
                            <span className="truncate">{e.tenant?.name || "—"}</span>
                            {e.tenant?.tenant_type && (
                              <Badge variant="outline" className="text-[10px] uppercase w-fit mt-0.5">
                                {formatEnumLabel(e.tenant.tenant_type)}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm max-w-[220px]">
                          <div className="flex items-center gap-2">
                            {e.course?.thumbnail_url ? (
                              <img src={e.course.thumbnail_url} alt="" className="h-8 w-8 rounded object-cover flex-shrink-0 aspect-square" />
                            ) : (
                              <div className="h-8 w-8 rounded bg-muted flex-shrink-0 aspect-square" />
                            )}

                            <span className="truncate">{e.course?.title || "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-xs capitalize", sourceTone(e.source))}>
                            {sourceLabel(e.source)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="w-24">
                            <CourseProgressBar
                              percentage={prog?.progress_percentage ?? 0}
                              showLabel
                              size="sm"
                            />
                            {prog && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {prog.completed_lessons ?? 0}/{prog.total_lessons ?? 0}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {e.enrolled_at ? formatDistanceToNow(new Date(e.enrolled_at), { addSuffix: true }) : "—"}
                        </TableCell>
                        <TableCell className={cn("text-sm", expiresSoon || expired ? "text-red-600 font-medium" : "text-muted-foreground")}>
                          {e.expires_at ? format(new Date(e.expires_at), "dd MMM yyyy") : "—"}
                        </TableCell>
                        <TableCell>{statusChip(e)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setDrawerEnrolmentId(e.id)}>
                                <Eye className="h-4 w-4 mr-2" /> View progress detail
                              </DropdownMenuItem>
                              {canManageEnrolments && (
                                <>
                                  <DropdownMenuItem onClick={() => { setExtendTarget(e.id); setExtendDate(e.expires_at ? new Date(e.expires_at) : undefined); }}>
                                    <CalendarIcon className="h-4 w-4 mr-2" /> Extend expiry
                                  </DropdownMenuItem>
                                  {revoked ? (
                                    <DropdownMenuItem onClick={() => reactivateMutation.mutate(e.id)}>
                                      <RefreshCw className="h-4 w-4 mr-2" /> Reactivate
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem className="text-destructive" onClick={() => setRevokeTarget(e.id)}>
                                      <XCircle className="h-4 w-4 mr-2" /> Revoke
                                    </DropdownMenuItem>
                                  )}
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* Revoke single */}
      <AlertDialog open={revokeTarget !== null} onOpenChange={() => setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke enrolment</AlertDialogTitle>
            <AlertDialogDescription>
              This immediately revokes access. The user will no longer be able to access this course.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (revokeTarget) {
                revokeMutation.mutate({ id: revokeTarget }, { onSuccess: () => setRevokeTarget(null) });
              }
            }}>
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk revoke */}
      <AlertDialog open={bulkRevokeOpen} onOpenChange={setBulkRevokeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {selectedIds.size} enrolment{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              All selected learners will lose access to their courses. Any revocations rejected by RLS will be reported.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkRevoke}>
              Revoke {selectedIds.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Extend single */}
      <Dialog open={extendTarget !== null} onOpenChange={() => setExtendTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend expiry date</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center py-4">
            <Calendar
              mode="single"
              selected={extendDate}
              onSelect={setExtendDate}
              className="p-3 pointer-events-auto"
              disabled={(date) => date < new Date()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendTarget(null)}>Cancel</Button>
            <Button
              disabled={!extendDate}
              onClick={() => {
                if (extendTarget && extendDate) {
                  extendMutation.mutate(
                    { id: extendTarget, date: extendDate.toISOString() },
                    { onSuccess: () => { setExtendTarget(null); setExtendDate(undefined); } }
                  );
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk extend */}
      <Dialog open={bulkExtendOpen} onOpenChange={setBulkExtendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend expiry for {selectedIds.size} enrolment{selectedIds.size === 1 ? "" : "s"}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center py-4">
            <Calendar
              mode="single"
              selected={bulkExtendDate}
              onSelect={setBulkExtendDate}
              className="p-3 pointer-events-auto"
              disabled={(date) => date < new Date()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkExtendOpen(false)}>Cancel</Button>
            <Button disabled={!bulkExtendDate} onClick={handleBulkExtend}>
              Apply to {selectedIds.size}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Progress drawer */}
      <EnrolmentProgressDrawer
        enrolmentId={drawerEnrolmentId}
        onClose={() => setDrawerEnrolmentId(null)}
      />

      {/* New enrolment modal */}
      <NewEnrolmentModal open={newOpen} onOpenChange={setNewOpen} />
    </DashboardLayout>
  );
}
