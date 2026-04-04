import { useState, useMemo } from "react";
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
import { format } from "date-fns";
import {
  Search, Plus, MoreHorizontal, Eye, CalendarIcon, XCircle,
  RefreshCw, Users, CheckCircle, Clock, Ban, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AcademyStatCard from "@/components/academy/admin/AcademyStatCard";
import CourseProgressBar from "@/components/academy/admin/CourseProgressBar";
import EnrolmentProgressDrawer from "@/components/academy/admin/EnrolmentProgressDrawer";
import {
  useAdminEnrollments,
  useEnrollmentProgress,
  useEnrollmentFilterOptions,
  useRevokeEnrollment,
  useReactivateEnrollment,
  useExtendEnrollment,
} from "@/hooks/academy/useAcademyEnrollments";

type StatusFilter = "all" | "active" | "completed" | "expired" | "revoked";
type SourceFilter = "all" | "manual" | "auto" | "package";

export default function AcademyEnrolmentsPage() {
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [revokeTarget, setRevokeTarget] = useState<number | null>(null);
  const [extendTarget, setExtendTarget] = useState<number | null>(null);
  const [extendDate, setExtendDate] = useState<Date | undefined>();
  const [drawerEnrolmentId, setDrawerEnrolmentId] = useState<number | null>(null);

  // ── Data hooks ──
  const { data: enrolments, isLoading } = useAdminEnrollments();
  const { data: progressMap = new Map() } = useEnrollmentProgress();
  const { courses, tenants } = useEnrollmentFilterOptions();
  const revokeMutation = useRevokeEnrollment();
  const reactivateMutation = useReactivateEnrollment();
  const extendMutation = useExtendEnrollment();

  // Filter enrolments
  const filtered = useMemo(() => {
    if (!enrolments) return [];
    return enrolments.filter((e: any) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (sourceFilter !== "all" && e.source !== sourceFilter) return false;
      if (courseFilter !== "all" && String(e.course_id) !== courseFilter) return false;
      if (tenantFilter !== "all" && String(e.tenant_id) !== tenantFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const userName = `${e.user?.first_name || ""} ${e.user?.last_name || ""}`.toLowerCase();
        const email = (e.user?.email || "").toLowerCase();
        const tenantName = (e.tenant?.name || "").toLowerCase();
        if (!userName.includes(s) && !email.includes(s) && !tenantName.includes(s)) return false;
      }
      return true;
    });
  }, [enrolments, statusFilter, sourceFilter, courseFilter, tenantFilter, search]);

  // Stats
  const stats = useMemo(() => {
    if (!enrolments) return { active: 0, completed: 0, expired: 0, revoked: 0 };
    return {
      active: enrolments.filter((e: any) => e.status === "active").length,
      completed: enrolments.filter((e: any) => e.status === "completed").length,
      expired: enrolments.filter((e: any) => e.status === "expired").length,
      revoked: enrolments.filter((e: any) => e.status === "revoked").length,
    };
  }, [enrolments]);

  // Bulk revoke
  const handleBulkRevoke = async () => {
    for (const id of selectedIds) {
      await revokeMutation.mutateAsync({ id });
    }
    setSelectedIds(new Set());
  };

  // CSV export
  const handleExport = () => {
    const rows = filtered.map((e: any) => ({
      User: `${e.user?.first_name || ""} ${e.user?.last_name || ""}`,
      Email: e.user?.email || "",
      Tenant: e.tenant?.name || "",
      Course: e.course?.title || "",
      Source: e.source || "",
      Status: e.status || "",
      Progress: progressMap.get(e.id)?.progress_percentage ?? 0,
      Enrolled: e.enrolled_at ? format(new Date(e.enrolled_at), "yyyy-MM-dd") : "",
      Expires: e.expires_at ? format(new Date(e.expires_at), "yyyy-MM-dd") : "",
    }));
    const headers = Object.keys(rows[0] || {}).join(",");
    const csv = [headers, ...rows.map((r) => Object.values(r).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `enrolments-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((e: any) => e.id)));
    }
  };

  const statusColor = (s: string) => {
    if (s === "active") return "bg-green-100 text-green-700";
    if (s === "completed") return "bg-blue-100 text-blue-700";
    if (s === "expired") return "bg-amber-100 text-amber-700";
    if (s === "revoked") return "bg-red-100 text-red-500";
    return "bg-gray-100 text-gray-600";
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Enrolments</h1>
          <Button style={{ backgroundColor: "#23c0dd" }} className="text-white">
            <Plus className="h-4 w-4 mr-1" /> New Enrolment
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <AcademyStatCard label="Total Active" value={stats.active} icon={<Users className="h-5 w-5 text-primary" />} loading={isLoading} />
          <AcademyStatCard label="Completed" value={stats.completed} icon={<CheckCircle className="h-5 w-5 text-green-600" />} loading={isLoading} />
          <AcademyStatCard label="Expired" value={stats.expired} icon={<Clock className="h-5 w-5 text-amber-500" />} loading={isLoading} />
          <AcademyStatCard label="Revoked" value={stats.revoked} icon={<Ban className="h-5 w-5 text-red-500" />} loading={isLoading} />
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search user, email, tenant…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={courseFilter} onValueChange={setCourseFilter}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Courses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Courses</SelectItem>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={tenantFilter} onValueChange={setTenantFilter}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Tenants" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tenants</SelectItem>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="auto">Auto</SelectItem>
                  <SelectItem value="package">Package</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Status tabs */}
            <div className="flex gap-1 border-b">
              {(["all", "active", "completed", "expired", "revoked"] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "px-3 py-2 text-sm font-medium capitalize whitespace-nowrap transition-colors",
                    statusFilter === s
                      ? "text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 bg-muted rounded-lg">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Button size="sm" variant="destructive" onClick={handleBulkRevoke}>
              <XCircle className="h-3.5 w-3.5 mr-1" /> Revoke Selected
            </Button>
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
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
                  <TableHead>User</TableHead>
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
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      No enrolments found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((e: any) => {
                    const prog = progressMap.get(e.id);
                    return (
                      <TableRow key={e.id}>
                        <TableCell>
                          <Checkbox checked={selectedIds.has(e.id)} onCheckedChange={() => toggleSelect(e.id)} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium flex-shrink-0">
                              {e.user?.avatar_url ? (
                                <img src={e.user.avatar_url} className="h-8 w-8 rounded-full object-cover" alt="" />
                              ) : (
                                `${(e.user?.first_name || "?")[0]}${(e.user?.last_name || "")[0]}`
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{e.user?.first_name} {e.user?.last_name}</p>
                              <p className="text-xs text-muted-foreground truncate">{e.user?.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{e.tenant?.name || "—"}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{e.course?.title || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">{e.source || "—"}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="w-24">
                            <CourseProgressBar percentage={prog?.progress_percentage ?? 0} showLabel size="sm" />
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {e.enrolled_at ? format(new Date(e.enrolled_at), "dd MMM yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {e.expires_at ? format(new Date(e.expires_at), "dd MMM yyyy") : "—"}
                        </TableCell>
                        <TableCell>
                          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize", statusColor(e.status || ""))}>
                            {e.status || "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setDrawerEnrolmentId(e.id)}>
                                <Eye className="h-4 w-4 mr-2" /> View Progress Detail
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setExtendTarget(e.id); setExtendDate(e.expires_at ? new Date(e.expires_at) : undefined); }}>
                                <CalendarIcon className="h-4 w-4 mr-2" /> Extend Expiry
                              </DropdownMenuItem>
                              {e.status === "revoked" ? (
                                <DropdownMenuItem onClick={() => reactivateMutation.mutate(e.id)}>
                                  <RefreshCw className="h-4 w-4 mr-2" /> Re-activate
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem className="text-destructive" onClick={() => setRevokeTarget(e.id)}>
                                  <XCircle className="h-4 w-4 mr-2" /> Revoke
                                </DropdownMenuItem>
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

      {/* Revoke confirmation */}
      <AlertDialog open={revokeTarget !== null} onOpenChange={() => setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Enrolment</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately revoke access. The user will no longer be able to access this course. Are you sure?
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

      {/* Extend expiry dialog */}
      <Dialog open={extendTarget !== null} onOpenChange={() => setExtendTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend Expiry Date</DialogTitle>
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

      {/* Progress drawer */}
      <EnrolmentProgressDrawer
        enrolmentId={drawerEnrolmentId}
        onClose={() => setDrawerEnrolmentId(null)}
      />
    </DashboardLayout>
  );
}
