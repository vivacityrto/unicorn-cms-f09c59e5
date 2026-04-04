import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, isAfter, isBefore } from "date-fns";
import {
  Search, MoreHorizontal, Download, Ban, Copy, Eye, Plus, Award, CalendarIcon, ShieldX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import AcademyStatCard from "@/components/academy/admin/AcademyStatCard";

type StatusFilter = "all" | "active" | "revoked" | "expired";

interface CertRow {
  id: number;
  certificate_number: string;
  user_id: string;
  user_name: string;
  user_email: string;
  tenant_id: number | null;
  tenant_name: string;
  course_id: number;
  course_title: string;
  issued_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  public_url: string | null;
  storage_path: string | null;
  enrollment_id: number;
  metadata: Record<string, any> | null;
}

export default function AcademyCertificatesPage() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  // Issue modal
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueUserSearch, setIssueUserSearch] = useState("");
  const [issueUserId, setIssueUserId] = useState("");
  const [issueCourseId, setIssueCourseId] = useState("");
  const [issueNotes, setIssueNotes] = useState("");

  // Revoke dialog
  const [revokeTarget, setRevokeTarget] = useState<CertRow | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const now = new Date();

  // ── Fetch certificates ──
  const { data: certs = [], isLoading } = useQuery<CertRow[]>({
    queryKey: ["academy-certificates-admin"],
    queryFn: async () => {
      // Separate queries to avoid deep type instantiation
      const { data: certData, error } = await supabase
        .from("academy_certificates")
        .select("id, certificate_number, user_id, course_id, tenant_id, enrollment_id, issued_at, expires_at, revoked_at, revoke_reason, public_url, storage_path, metadata")
        .order("issued_at", { ascending: false });
      if (error) throw error;
      if (!certData?.length) return [];

      const userIds = [...new Set(certData.map((c: any) => c.user_id))];
      const courseIds = [...new Set(certData.map((c: any) => c.course_id))];
      const tenantIds = [...new Set(certData.map((c: any) => c.tenant_id).filter(Boolean))] as number[];

      const [{ data: users }, { data: courses }, { data: tenantsList }] = await Promise.all([
        supabase.from("users").select("user_uuid, first_name, last_name, email").in("user_uuid", userIds),
        supabase.from("academy_courses").select("id, title").in("id", courseIds),
        tenantIds.length > 0
          ? supabase.from("tenants").select("id, name").in("id", tenantIds)
          : Promise.resolve({ data: [] }),
      ]);

      const userMap = new Map((users ?? []).map((u: any) => [u.user_uuid, u]));
      const courseMap = new Map((courses ?? []).map((c: any) => [c.id, c.title]));
      const tenantMap = new Map((tenantsList ?? []).map((t: any) => [t.id, t.name]));

      return certData.map((c: any) => {
        const user = userMap.get(c.user_id);
        return {
          id: c.id,
          certificate_number: c.certificate_number,
          user_id: c.user_id,
          user_name: user ? `${user.first_name} ${user.last_name}` : "Unknown",
          user_email: user?.email ?? "",
          tenant_id: c.tenant_id,
          tenant_name: c.tenant_id ? (tenantMap.get(c.tenant_id) ?? `Tenant ${c.tenant_id}`) : "—",
          course_id: c.course_id,
          course_title: courseMap.get(c.course_id) ?? `Course ${c.course_id}`,
          issued_at: c.issued_at,
          expires_at: c.expires_at,
          revoked_at: c.revoked_at,
          revoke_reason: c.revoke_reason,
          public_url: c.public_url,
          storage_path: c.storage_path,
          enrollment_id: c.enrollment_id,
          metadata: c.metadata as Record<string, any> | null,
        };
      });
    },
  });

  // ── Unique courses & tenants for filters ──
  const uniqueCourses = useMemo(() => {
    const map = new Map<number, string>();
    certs.forEach((c) => map.set(c.course_id, c.course_title));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [certs]);

  const uniqueTenants = useMemo(() => {
    const map = new Map<number, string>();
    certs.forEach((c) => { if (c.tenant_id) map.set(c.tenant_id, c.tenant_name); });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [certs]);

  // ── Stats ──
  const stats = useMemo(() => {
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const totalIssued = certs.filter((c) => !c.revoked_at).length;
    const issuedThisMonth = certs.filter((c) => {
      if (!c.issued_at || c.revoked_at) return false;
      const d = new Date(c.issued_at);
      return !isBefore(d, monthStart) && !isAfter(d, monthEnd);
    }).length;
    const revoked = certs.filter((c) => !!c.revoked_at).length;
    return { totalIssued, issuedThisMonth, revoked };
  }, [certs]);

  // ── Status helper ──
  const getCertStatus = (c: CertRow): "active" | "revoked" | "expired" => {
    if (c.revoked_at) return "revoked";
    if (c.expires_at && isBefore(new Date(c.expires_at), now)) return "expired";
    return "active";
  };

  // ── Filtering ──
  const filtered = useMemo(() => {
    let list = certs;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        c.user_name.toLowerCase().includes(q) ||
        c.certificate_number.toLowerCase().includes(q) ||
        c.course_title.toLowerCase().includes(q)
      );
    }
    if (courseFilter !== "all") list = list.filter((c) => String(c.course_id) === courseFilter);
    if (tenantFilter !== "all") list = list.filter((c) => String(c.tenant_id) === tenantFilter);
    if (statusFilter !== "all") list = list.filter((c) => getCertStatus(c) === statusFilter);
    if (dateFrom) list = list.filter((c) => c.issued_at && !isBefore(new Date(c.issued_at), dateFrom));
    if (dateTo) list = list.filter((c) => c.issued_at && !isAfter(new Date(c.issued_at), dateTo));

    return list;
  }, [certs, search, courseFilter, tenantFilter, statusFilter, dateFrom, dateTo]);

  // ── Users search for manual issue ──
  const { data: searchedUsers = [] } = useQuery({
    queryKey: ["user-search", issueUserSearch],
    enabled: issueUserSearch.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("users")
        .select("user_uuid, first_name, last_name, email")
        .or(`first_name.ilike.%${issueUserSearch}%,last_name.ilike.%${issueUserSearch}%,email.ilike.%${issueUserSearch}%`)
        .limit(20);
      return data ?? [];
    },
  });

  // ── Courses for manual issue ──
  const { data: issueCourses = [] } = useQuery({
    queryKey: ["courses-for-issue"],
    enabled: issueOpen,
    queryFn: async () => {
      const { data } = await supabase.from("academy_courses").select("id, title").eq("status", "published").order("title");
      return data ?? [];
    },
  });

  // ── Revoke mutation ──
  const revokeMutation = useMutation({
    mutationFn: async () => {
      if (!revokeTarget) return;
      const { error } = await supabase
        .from("academy_certificates")
        .update({
          revoked_at: new Date().toISOString(),
          revoked_by: session?.user?.id ?? null,
          revoke_reason: revokeReason,
        } as any)
        .eq("id", revokeTarget.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Certificate revoked");
      setRevokeTarget(null);
      setRevokeReason("");
      queryClient.invalidateQueries({ queryKey: ["academy-certificates-admin"] });
    },
    onError: () => toast.error("Failed to revoke certificate"),
  });

  // ── Manual issue mutation ──
  const issueMutation = useMutation({
    mutationFn: async () => {
      // First get or create an enrollment
      const courseId = parseInt(issueCourseId);

      // Check for existing enrollment
      const { data: existing } = await supabase
        .from("academy_enrollments")
        .select("id")
        .eq("user_id", issueUserId)
        .eq("course_id", courseId)
        .maybeSingle();

      let enrollmentId: number;
      if (existing) {
        enrollmentId = existing.id;
      } else {
        const { data: newEnrol, error: enrolErr } = await supabase
          .from("academy_enrollments")
          .insert({
            user_id: issueUserId,
            course_id: courseId,
            status: "completed",
            completed_at: new Date().toISOString(),
          } as any)
          .select("id")
          .single();
        if (enrolErr) throw enrolErr;
        enrollmentId = newEnrol.id;
      }

      // Generate certificate number
      const { data: certNum, error: rpcErr } = await supabase.rpc("generate_certificate_number");
      if (rpcErr) throw rpcErr;

      const meta = issueNotes ? { manual_issue_reason: issueNotes } : null;

      const { error } = await supabase.from("academy_certificates").insert({
        user_id: issueUserId,
        course_id: courseId,
        enrollment_id: enrollmentId,
        certificate_number: certNum,
        issued_at: new Date().toISOString(),
        issued_by: session?.user?.id ?? null,
        metadata: meta,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Certificate issued successfully");
      setIssueOpen(false);
      setIssueUserId("");
      setIssueCourseId("");
      setIssueNotes("");
      setIssueUserSearch("");
      queryClient.invalidateQueries({ queryKey: ["academy-certificates-admin"] });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to issue certificate"),
  });

  // ── Status badge ──
  const statusBadge = (c: CertRow) => {
    const s = getCertStatus(c);
    if (s === "revoked") return <Badge variant="destructive">Revoked</Badge>;
    if (s === "expired") return <Badge variant="secondary" className="text-muted-foreground">Expired</Badge>;
    return <Badge className="bg-green-100 text-green-700 border-green-200">Active</Badge>;
  };

  const statusTabs: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "revoked", label: "Revoked" },
    { value: "expired", label: "Expired" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Certificates</h1>
          </div>
          <Button variant="outline" onClick={() => setIssueOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Issue Certificate Manually
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <AcademyStatCard
            label="Total Issued"
            value={stats.totalIssued}
            icon={<Award className="h-5 w-5 text-primary" />}
            loading={isLoading}
          />
          <AcademyStatCard
            label="Issued This Month"
            value={stats.issuedThisMonth}
            icon={<CalendarIcon className="h-5 w-5 text-primary" />}
            loading={isLoading}
          />
          <AcademyStatCard
            label="Revoked"
            value={stats.revoked}
            icon={<ShieldX className="h-5 w-5 text-destructive" />}
            loading={isLoading}
          />
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search user, cert #, course…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>

          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Courses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Courses</SelectItem>
              {uniqueCourses.map(([id, title]) => (
                <SelectItem key={id} value={String(id)}>{title}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tenantFilter} onValueChange={setTenantFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Tenants" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tenants</SelectItem>
              {uniqueTenants.map(([id, name]) => (
                <SelectItem key={id} value={String(id)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date from */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[140px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateFrom ? format(dateFrom, "dd MMM yy") : "From"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>

          {/* Date to */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[140px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateTo ? format(dateTo, "dd MMM yy") : "To"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 border rounded-lg p-1 bg-muted/30 w-fit">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors font-medium",
                statusFilter === tab.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Certificate No.</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Issued Date</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))}

                {!isLoading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      No certificates found
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading && filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <code className="text-xs px-2 py-1 rounded bg-muted font-mono text-foreground">
                        {c.certificate_number}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{c.user_name}</div>
                      <div className="text-xs text-muted-foreground">{c.user_email}</div>
                    </TableCell>
                    <TableCell className="text-sm">{c.tenant_name}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{c.course_title}</TableCell>
                    <TableCell className="text-sm">
                      {c.issued_at ? format(new Date(c.issued_at), "dd MMM yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.expires_at ? format(new Date(c.expires_at), "dd MMM yyyy") : "—"}
                    </TableCell>
                    <TableCell>{statusBadge(c)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {(c.storage_path || c.public_url) && (
                            <DropdownMenuItem onClick={() => window.open(c.public_url || c.storage_path || "", "_blank")}>
                              <Download className="h-4 w-4 mr-2" /> Download PDF
                            </DropdownMenuItem>
                          )}
                          {c.public_url && (
                            <DropdownMenuItem onClick={() => {
                              navigator.clipboard.writeText(c.public_url!);
                              toast.success("Share link copied");
                            }}>
                              <Copy className="h-4 w-4 mr-2" /> Copy Share Link
                            </DropdownMenuItem>
                          )}
                          {!c.revoked_at && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setRevokeTarget(c)}
                            >
                              <Ban className="h-4 w-4 mr-2" /> Revoke
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem asChild>
                            <a href={`/superadmin/academy/enrollments?search=${encodeURIComponent(c.user_name)}`}>
                              <Eye className="h-4 w-4 mr-2" /> View Enrolment
                            </a>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* ── Issue Certificate Modal ── */}
      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Issue Certificate Manually</DialogTitle>
            <DialogDescription>
              Issue a certificate outside the normal completion flow.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* User search */}
            <div className="space-y-2">
              <Label>User</Label>
              <Input
                placeholder="Search by name or email…"
                value={issueUserSearch}
                onChange={(e) => { setIssueUserSearch(e.target.value); setIssueUserId(""); }}
              />
              {issueUserSearch.length >= 2 && !issueUserId && searchedUsers.length > 0 && (
                <div className="border rounded-md max-h-40 overflow-y-auto">
                  {searchedUsers.map((u: any) => (
                    <button
                      key={u.user_uuid}
                      onClick={() => {
                        setIssueUserId(u.user_uuid);
                        setIssueUserSearch(`${u.first_name} ${u.last_name} (${u.email})`);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                    >
                      {u.first_name} {u.last_name} — <span className="text-muted-foreground">{u.email}</span>
                    </button>
                  ))}
                </div>
              )}
              {issueUserId && (
                <Badge variant="secondary" className="text-xs">User selected ✓</Badge>
              )}
            </div>

            {/* Course */}
            <div className="space-y-2">
              <Label>Course</Label>
              <Select value={issueCourseId} onValueChange={setIssueCourseId}>
                <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                <SelectContent>
                  {issueCourses.map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes / Reason</Label>
              <Textarea
                value={issueNotes}
                onChange={(e) => setIssueNotes(e.target.value)}
                placeholder="Reason for manual issuance…"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueOpen(false)}>Cancel</Button>
            <Button
              onClick={() => issueMutation.mutate()}
              disabled={!issueUserId || !issueCourseId || issueMutation.isPending}
            >
              Issue Certificate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Revoke Confirmation ── */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => { if (!open) { setRevokeTarget(null); setRevokeReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Certificate</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke certificate{" "}
              <code className="font-mono text-foreground bg-muted px-1 rounded">{revokeTarget?.certificate_number}</code>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label>Revocation Reason *</Label>
            <Textarea
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="Explain why this certificate is being revoked…"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeMutation.mutate()}
              disabled={!revokeReason.trim() || revokeMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke Certificate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
