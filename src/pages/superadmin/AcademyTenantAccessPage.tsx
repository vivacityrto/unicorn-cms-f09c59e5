import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { format, addDays, startOfMonth, endOfMonth, addMonths, isAfter, isBefore } from "date-fns";
import {
  Search, Settings, Eye, CalendarIcon, Shield, ShieldOff, Clock, X, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import AcademyStatCard from "@/components/academy/admin/AcademyStatCard";

type StatusTab = "all" | "enabled" | "disabled" | "expiring";

interface TenantRow {
  id: number;
  name: string;
  academy_access_enabled: boolean;
  academy_max_users: number | null;
  academy_subscription_expires_at: string | null;
  metadata: Record<string, any> | null;
  enrolled_count: number;
  package_name: string | null;
}

interface AutoEnrolRule {
  id: number;
  package_id: number;
  course_id: number;
  is_active: boolean;
  package_name: string | null;
  course_title: string | null;
}

export default function AcademyTenantAccessPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [drawerTenant, setDrawerTenant] = useState<TenantRow | null>(null);
  const [timelineMonth, setTimelineMonth] = useState<string | null>(null);

  // Drawer form state
  const [formAccess, setFormAccess] = useState(false);
  const [formMaxUsers, setFormMaxUsers] = useState<number | "">("");
  const [formExpires, setFormExpires] = useState<Date | undefined>();
  const [formNotes, setFormNotes] = useState("");

  // Auto-enrol rule form
  const [showAddRule, setShowAddRule] = useState(false);
  const [rulePackageId, setRulePackageId] = useState<string>("");
  const [ruleCourseId, setRuleCourseId] = useState<string>("");

  const now = new Date();
  const thirtyDaysFromNow = addDays(now, 30);

  // ── Fetch tenants ──
  const { data: tenants = [], isLoading } = useQuery<TenantRow[]>({
    queryKey: ["academy-tenant-access"],
    queryFn: async () => {
      const { data: tenantData, error } = await supabase
        .from("tenants")
        .select("id, name, academy_access_enabled, academy_max_users, academy_subscription_expires_at, metadata")
        .order("name");
      if (error) throw error;

      // Get enrolled counts per tenant
      const { data: enrolData } = await supabase
        .from("academy_enrollments")
        .select("tenant_id")
        .eq("status", "active");

      const countMap = new Map<number, number>();
      (enrolData ?? []).forEach((e: any) => {
        countMap.set(e.tenant_id, (countMap.get(e.tenant_id) || 0) + 1);
      });

      return (tenantData ?? []).map((t: any) => ({
        id: t.id,
        name: t.name ?? `Tenant ${t.id}`,
        academy_access_enabled: t.academy_access_enabled ?? false,
        academy_max_users: t.academy_max_users,
        academy_subscription_expires_at: t.academy_subscription_expires_at,
        metadata: t.metadata as Record<string, any> | null,
        enrolled_count: countMap.get(t.id) || 0,
        package_name: null, // placeholder
      }));
    },
  });

  // ── Fetch auto-enrol rules for drawer ──
  const { data: autoEnrolRules = [], refetch: refetchRules } = useQuery<AutoEnrolRule[]>({
    queryKey: ["academy-auto-enrol-rules", drawerTenant?.id],
    enabled: !!drawerTenant,
    queryFn: async () => {
      if (!drawerTenant) return [];
      const { data: rules } = await supabase
        .from("academy_package_course_rules")
        .select("id, package_id, course_id, is_active")
        .eq("is_active", true);

      if (!rules?.length) return [];

      const packageIds = [...new Set(rules.map((r: any) => r.package_id))];
      const courseIds = [...new Set(rules.map((r: any) => r.course_id))];

      const [{ data: pkgs }, { data: courses }] = await Promise.all([
        supabase.from("packages").select("id, name").in("id", packageIds),
        supabase.from("academy_courses").select("id, title").in("id", courseIds),
      ]);

      const pkgMap = new Map((pkgs ?? []).map((p: any) => [p.id, p.name]));
      const courseMap = new Map((courses ?? []).map((c: any) => [c.id, c.title]));

      return rules.map((r: any) => ({
        id: r.id,
        package_id: r.package_id,
        course_id: r.course_id,
        is_active: r.is_active,
        package_name: pkgMap.get(r.package_id) ?? `Package ${r.package_id}`,
        course_title: courseMap.get(r.course_id) ?? `Course ${r.course_id}`,
      }));
    },
  });

  // ── Packages & courses for add-rule form ──
  const { data: allPackages = [] } = useQuery({
    queryKey: ["packages-list"],
    enabled: showAddRule,
    queryFn: async () => {
      const { data } = await supabase.from("packages").select("id, name").order("name");
      return data ?? [];
    },
  });

  const { data: allCourses = [] } = useQuery({
    queryKey: ["courses-list"],
    enabled: showAddRule,
    queryFn: async () => {
      const { data } = await supabase.from("academy_courses").select("id, title").eq("status", "published").order("title");
      return data ?? [];
    },
  });

  // ── Toggle access mutation ──
  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const { error } = await supabase
        .from("tenants")
        .update({ academy_access_enabled: enabled } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(`Academy access ${vars.enabled ? "enabled" : "disabled"}`);
      queryClient.invalidateQueries({ queryKey: ["academy-tenant-access"] });
    },
    onError: () => toast.error("Failed to update access"),
  });

  // ── Save settings mutation ──
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!drawerTenant) return;
      const existingMeta = (drawerTenant.metadata ?? {}) as Record<string, any>;
      const newMeta = { ...existingMeta, academy_notes: formNotes || null };
      const { error } = await supabase
        .from("tenants")
        .update({
          academy_access_enabled: formAccess,
          academy_max_users: formMaxUsers === "" ? null : formMaxUsers,
          academy_subscription_expires_at: formExpires ? formExpires.toISOString() : null,
          metadata: newMeta,
        } as any)
        .eq("id", drawerTenant.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Academy settings saved");
      setDrawerTenant(null);
      queryClient.invalidateQueries({ queryKey: ["academy-tenant-access"] });
    },
    onError: () => toast.error("Failed to save settings"),
  });

  // ── Add auto-enrol rule ──
  const addRuleMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("academy_package_course_rules").insert({
        package_id: parseInt(rulePackageId),
        course_id: parseInt(ruleCourseId),
        is_active: true,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Auto-enrol rule added");
      setShowAddRule(false);
      setRulePackageId("");
      setRuleCourseId("");
      refetchRules();
    },
    onError: () => toast.error("Failed to add rule"),
  });

  // ── Remove auto-enrol rule ──
  const removeRuleMutation = useMutation({
    mutationFn: async (ruleId: number) => {
      const { error } = await supabase
        .from("academy_package_course_rules")
        .update({ is_active: false } as any)
        .eq("id", ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rule removed");
      refetchRules();
    },
  });

  // ── Open drawer ──
  const openDrawer = (t: TenantRow) => {
    setDrawerTenant(t);
    setFormAccess(t.academy_access_enabled);
    setFormMaxUsers(t.academy_max_users ?? "");
    setFormExpires(t.academy_subscription_expires_at ? new Date(t.academy_subscription_expires_at) : undefined);
    setFormNotes((t.metadata as any)?.academy_notes ?? "");
    setShowAddRule(false);
  };

  // ── Computed stats ──
  const stats = useMemo(() => {
    const withAccess = tenants.filter((t) => t.academy_access_enabled).length;
    const withoutAccess = tenants.length - withAccess;
    const expiring = tenants.filter((t) => {
      if (!t.academy_subscription_expires_at) return false;
      const exp = new Date(t.academy_subscription_expires_at);
      return isAfter(exp, now) && isBefore(exp, thirtyDaysFromNow);
    }).length;
    return { withAccess, withoutAccess, expiring };
  }, [tenants]);

  // ── Filter logic ──
  const filtered = useMemo(() => {
    let list = tenants;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q));
    }

    if (statusTab === "enabled") list = list.filter((t) => t.academy_access_enabled);
    if (statusTab === "disabled") list = list.filter((t) => !t.academy_access_enabled);
    if (statusTab === "expiring") {
      list = list.filter((t) => {
        if (!t.academy_subscription_expires_at) return false;
        const exp = new Date(t.academy_subscription_expires_at);
        return isAfter(exp, now) && isBefore(exp, thirtyDaysFromNow);
      });
    }

    // Timeline month filter
    if (timelineMonth) {
      list = list.filter((t) => {
        if (!t.academy_subscription_expires_at) return false;
        return format(new Date(t.academy_subscription_expires_at), "yyyy-MM") === timelineMonth;
      });
    }

    return list;
  }, [tenants, search, statusTab, timelineMonth]);

  // ── Expiry timeline (next 6 months) ──
  const expiryTimeline = useMemo(() => {
    const months: { key: string; label: string; count: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const monthStart = startOfMonth(addMonths(now, i));
      const monthEnd = endOfMonth(monthStart);
      const key = format(monthStart, "yyyy-MM");
      const count = tenants.filter((t) => {
        if (!t.academy_subscription_expires_at) return false;
        const exp = new Date(t.academy_subscription_expires_at);
        return !isBefore(exp, monthStart) && !isAfter(exp, monthEnd);
      }).length;
      if (count > 0) {
        months.push({ key, label: format(monthStart, "MMMM yyyy"), count });
      }
    }
    return months;
  }, [tenants]);

  // ── Access status badge ──
  const getAccessBadge = (t: TenantRow) => {
    if (!t.academy_access_enabled)
      return <Badge variant="secondary" className="text-muted-foreground">Disabled</Badge>;
    if (t.academy_subscription_expires_at) {
      const exp = new Date(t.academy_subscription_expires_at);
      if (isAfter(exp, now) && isBefore(exp, thirtyDaysFromNow))
        return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Expiring Soon</Badge>;
    }
    return <Badge className="bg-green-100 text-green-700 border-green-200">Enabled</Badge>;
  };

  const tabs: { value: StatusTab; label: string }[] = [
    { value: "all", label: "All" },
    { value: "enabled", label: "Access Enabled" },
    { value: "disabled", label: "Access Disabled" },
    { value: "expiring", label: "Expiring Soon" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tenant Access</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Control Academy access and subscription settings for each client
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <AcademyStatCard
            label="Tenants with Access"
            value={stats.withAccess}
            icon={<Shield className="h-5 w-5 text-primary" />}
            loading={isLoading}
          />
          <AcademyStatCard
            label="Without Access"
            value={stats.withoutAccess}
            icon={<ShieldOff className="h-5 w-5 text-muted-foreground" />}
            loading={isLoading}
          />
          <AcademyStatCard
            label="Expiring This Month"
            value={stats.expiring}
            icon={<Clock className="h-5 w-5 text-orange-500" />}
            loading={isLoading}
          />
        </div>

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tenant name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1 border rounded-lg p-1 bg-muted/30">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => { setStatusTab(tab.value); setTimelineMonth(null); }}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md transition-colors font-medium",
                  statusTab === tab.value && !timelineMonth
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {timelineMonth && (
            <Button variant="ghost" size="sm" onClick={() => setTimelineMonth(null)} className="gap-1">
              <X className="h-3 w-3" /> Clear month filter
            </Button>
          )}
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant Name</TableHead>
                  <TableHead>Access Status</TableHead>
                  <TableHead className="text-center">Max Users</TableHead>
                  <TableHead className="text-center">Enrolled</TableHead>
                  <TableHead>Subscription Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))}

                {!isLoading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      No tenants found
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading && filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={t.academy_access_enabled}
                          onCheckedChange={(checked) => toggleMutation.mutate({ id: t.id, enabled: checked })}
                        />
                        {getAccessBadge(t)}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{t.academy_max_users ?? "—"}</TableCell>
                    <TableCell className="text-center">{t.enrolled_count}</TableCell>
                    <TableCell>
                      {t.academy_subscription_expires_at
                        ? format(new Date(t.academy_subscription_expires_at), "dd MMM yyyy")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openDrawer(t)}>
                          <Settings className="h-4 w-4 mr-1" /> Edit
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/superadmin/academy/enrollments?tenant=${t.id}`}>
                            <Eye className="h-4 w-4 mr-1" /> Enrolments
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Expiry Timeline */}
        {expiryTimeline.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Access Expiry Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {expiryTimeline.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => { setTimelineMonth(m.key); setStatusTab("all"); }}
                    className={cn(
                      "flex items-center justify-between w-full px-4 py-3 rounded-lg border transition-colors text-sm",
                      timelineMonth === m.key
                        ? "bg-primary/5 border-primary/20 text-foreground"
                        : "hover:bg-muted border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="font-medium">{m.label}</span>
                    <Badge variant="secondary">
                      {m.count} tenant{m.count !== 1 ? "s" : ""} expiring
                    </Badge>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Settings Drawer ── */}
      <Sheet open={!!drawerTenant} onOpenChange={(open) => { if (!open) setDrawerTenant(null); }}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{drawerTenant?.name} — Academy Settings</SheetTitle>
          </SheetHeader>

          <div className="space-y-6 py-6">
            {/* Access toggle */}
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Academy Access</Label>
              <Switch checked={formAccess} onCheckedChange={setFormAccess} />
            </div>

            {/* Max users */}
            <div className="space-y-2">
              <Label>Maximum Users</Label>
              <Input
                type="number"
                min={0}
                value={formMaxUsers}
                onChange={(e) => setFormMaxUsers(e.target.value === "" ? "" : parseInt(e.target.value))}
                placeholder="Unlimited"
              />
              <p className="text-xs text-muted-foreground">
                Maximum number of users from this tenant who can be enrolled simultaneously
              </p>
            </div>

            {/* Subscription expires */}
            <div className="space-y-2">
              <Label>Subscription Expires</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !formExpires && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formExpires ? format(formExpires, "PPP") : "No expiry set"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formExpires}
                    onSelect={setFormExpires}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Internal notes about this tenant's Academy access…"
                rows={3}
              />
            </div>

            {/* Auto-Enrol Rules */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Auto-Enrol on Package Assignment</Label>
                <Button variant="outline" size="sm" onClick={() => setShowAddRule(true)} className="gap-1">
                  <Plus className="h-3 w-3" /> Add Rule
                </Button>
              </div>

              {autoEnrolRules.length === 0 && (
                <p className="text-sm text-muted-foreground">No auto-enrol rules configured</p>
              )}

              {autoEnrolRules.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                  <div>
                    <span className="font-medium">{rule.package_name}</span>
                    <span className="text-muted-foreground mx-2">→</span>
                    <span>{rule.course_title}</span>
                  </div>
                  <button
                    onClick={() => removeRuleMutation.mutate(rule.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}

              {/* Add rule form */}
              {showAddRule && (
                <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
                  <div className="space-y-2">
                    <Label className="text-xs">Package</Label>
                    <Select value={rulePackageId} onValueChange={setRulePackageId}>
                      <SelectTrigger><SelectValue placeholder="Select package" /></SelectTrigger>
                      <SelectContent>
                        {allPackages.map((p: any) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Course</Label>
                    <Select value={ruleCourseId} onValueChange={setRuleCourseId}>
                      <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                      <SelectContent>
                        {allCourses.map((c: any) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => addRuleMutation.mutate()}
                      disabled={!rulePackageId || !ruleCourseId}
                      style={{ backgroundColor: "hsl(var(--primary))" }}
                    >
                      Save Rule
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowAddRule(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <SheetFooter className="gap-2">
            <Button variant="outline" onClick={() => setDrawerTenant(null)}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              Save Settings
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
}
