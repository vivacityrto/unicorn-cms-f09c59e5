import { useState, useMemo } from "react";
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
import { format, addDays, startOfMonth, endOfMonth, addMonths, isAfter, isBefore } from "date-fns";
import {
  Search, Settings, Eye, CalendarIcon, Shield, ShieldOff, Clock, X, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import AcademyStatCard from "@/components/academy/admin/AcademyStatCard";
import {
  useTenantSummaries,
  useToggleTenantAccess,
  useUpdateTenantAccess,
  usePackageCourseRules,
  useAddPackageCourseRule,
  useRemovePackageCourseRule,
  useRuleFormOptions,
  type TenantRow,
} from "@/hooks/academy/useTenantAcademyAccess";

type StatusTab = "all" | "enabled" | "disabled" | "expiring";

export default function AcademyTenantAccessPage() {
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

  // ── Data hooks ──
  const { data: tenants = [], isLoading } = useTenantSummaries();
  const toggleMutation = useToggleTenantAccess();
  const saveMutation = useUpdateTenantAccess();
  const { data: autoEnrolRules = [] } = usePackageCourseRules(!!drawerTenant);
  const addRuleMutation = useAddPackageCourseRule();
  const removeRuleMutation = useRemovePackageCourseRule();
  const { packages: allPackages, courses: allCourses } = useRuleFormOptions(showAddRule);

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
      const mStart = startOfMonth(addMonths(now, i));
      const mEnd = endOfMonth(mStart);
      const key = format(mStart, "yyyy-MM");
      const count = tenants.filter((t) => {
        if (!t.academy_subscription_expires_at) return false;
        const exp = new Date(t.academy_subscription_expires_at);
        return !isBefore(exp, mStart) && !isAfter(exp, mEnd);
      }).length;
      if (count > 0) months.push({ key, label: format(mStart, "MMMM yyyy"), count });
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

  const handleSaveSettings = () => {
    if (!drawerTenant) return;
    const existingMeta = (drawerTenant.metadata ?? {}) as Record<string, any>;
    const newMeta = { ...existingMeta, academy_notes: formNotes || null };
    saveMutation.mutate(
      {
        tenantId: drawerTenant.id,
        data: {
          academy_access_enabled: formAccess,
          academy_max_users: formMaxUsers === "" ? null : formMaxUsers as number,
          academy_subscription_expires_at: formExpires ? formExpires.toISOString() : null,
          metadata: newMeta,
        },
      },
      { onSuccess: () => setDrawerTenant(null) }
    );
  };

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
          <AcademyStatCard label="Tenants with Access" value={stats.withAccess} icon={<Shield className="h-5 w-5 text-primary" />} loading={isLoading} />
          <AcademyStatCard label="Without Access" value={stats.withoutAccess} icon={<ShieldOff className="h-5 w-5 text-muted-foreground" />} loading={isLoading} />
          <AcademyStatCard label="Expiring This Month" value={stats.expiring} icon={<Clock className="h-5 w-5 text-orange-500" />} loading={isLoading} />
        </div>

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search tenant name…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Academy Access</Label>
              <Switch checked={formAccess} onCheckedChange={setFormAccess} />
            </div>

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
                  <Calendar mode="single" selected={formExpires} onSelect={setFormExpires} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>

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
                      onClick={() => {
                        addRuleMutation.mutate(
                          { packageId: parseInt(rulePackageId), courseId: parseInt(ruleCourseId) },
                          { onSuccess: () => { setShowAddRule(false); setRulePackageId(""); setRuleCourseId(""); } }
                        );
                      }}
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
            <Button onClick={handleSaveSettings} disabled={saveMutation.isPending}>
              Save Settings
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
}
