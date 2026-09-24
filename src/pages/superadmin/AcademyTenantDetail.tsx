import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, isAfter, isBefore, addDays } from "date-fns";
import {
  ArrowLeft, CalendarIcon, X, Plus, UserPlus, Settings2, Users, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useTenantSummaries,
  useUpdateTenantAccess,
  usePackageCourseRules,
  useAddPackageCourseRule,
  useRemovePackageCourseRule,
  useRuleFormOptions,
} from "@/hooks/academy/useTenantAcademyAccess";
import { useAdminEnrollments } from "@/hooks/academy/useAcademyEnrollments";
import { isAcademySoloTenant } from "@/lib/tenantAccountSurface";
import { TenantInviteDialog } from "@/components/client/TenantInviteDialog";
import { ViewAsClientButton } from "@/components/client/ViewAsClientButton";
import { AcademyActivityDashboard } from "@/components/client/AcademyActivityDashboard";
import type { TenantType } from "@/contexts/TenantTypeContext";
import type { Json } from "@/integrations/supabase/types";

function getPreviousSoloMaxUsers(metadata: Json | null): number | "" | null {
  if (!isAcademySoloTenant(metadata)) return null;
  const solo = (metadata as Record<string, unknown>).academy_solo;
  if (!solo || typeof solo !== "object" || Array.isArray(solo)) return null;
  const previous = (solo as Record<string, unknown>).previous_max_users;
  if (previous === null) return "";
  return typeof previous === "number" && Number.isInteger(previous) ? previous : null;
}

export default function AcademyTenantDetail() {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tenantIdNum = tenantId ? parseInt(tenantId, 10) : null;

  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") || "settings");
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams((prev) => {
      prev.set("tab", value);
      return prev;
    });
  };

  const { data: tenants = [], isLoading } = useTenantSummaries();
  const tenant = useMemo(() => tenants.find((t) => t.id === tenantIdNum) ?? null, [tenants, tenantIdNum]);

  const now = useMemo(() => new Date(), []);
  const thirtyDaysFromNow = useMemo(() => addDays(now, 30), [now]);

  const [showInvite, setShowInvite] = useState(false);

  // Settings form state
  const [formAccess, setFormAccess] = useState(false);
  const [formSoloPilot, setFormSoloPilot] = useState(false);
  const [formMaxUsers, setFormMaxUsers] = useState<number | "">("");
  const [soloPilotPreviousMaxUsers, setSoloPilotPreviousMaxUsers] = useState<number | "" | null>(null);
  const [formExpires, setFormExpires] = useState<Date | undefined>();
  const [formNotes, setFormNotes] = useState("");
  const [formInitialized, setFormInitialized] = useState(false);

  const persistedSoloPilot = tenant ? isAcademySoloTenant(tenant.metadata) : false;

  // Initialize the form once per tenant load (not on every refetch) —
  // mirrors the old drawer's openDrawer() behaviour, just triggered by data
  // arriving instead of a Sheet opening.
  useEffect(() => {
    if (!tenant || formInitialized) return;
    setFormAccess(tenant.academy_access_enabled);
    setFormSoloPilot(persistedSoloPilot);
    setFormMaxUsers(tenant.academy_max_users ?? "");
    setSoloPilotPreviousMaxUsers(getPreviousSoloMaxUsers(tenant.metadata));
    setFormExpires(tenant.academy_subscription_expires_at ? new Date(tenant.academy_subscription_expires_at) : undefined);
    setFormNotes((tenant.metadata as { academy_notes?: string } | null)?.academy_notes ?? "");
    setFormInitialized(true);
  }, [tenant, formInitialized, persistedSoloPilot]);

  const saveMutation = useUpdateTenantAccess();
  const { data: autoEnrolRules = [] } = usePackageCourseRules(!!tenant && !persistedSoloPilot);
  const addRuleMutation = useAddPackageCourseRule();
  const removeRuleMutation = useRemovePackageCourseRule();
  const [showAddRule, setShowAddRule] = useState(false);
  const [rulePackageId, setRulePackageId] = useState<string>("");
  const [ruleCourseId, setRuleCourseId] = useState<string>("");
  const { packages: allPackages, courses: allCourses } = useRuleFormOptions(showAddRule && !persistedSoloPilot);

  const handleSaveSettings = () => {
    if (!tenant) return;
    const existingMeta = (tenant.metadata ?? {}) as Record<string, unknown>;
    const newMeta = { ...existingMeta, academy_notes: formNotes || null };
    saveMutation.mutate({
      tenantId: tenant.id,
      data: {
        academy_access_enabled: formAccess,
        academy_solo: formSoloPilot,
        academy_max_users: formMaxUsers === "" ? null : (formMaxUsers as number),
        academy_subscription_expires_at: formExpires ? formExpires.toISOString() : null,
        metadata: newMeta,
      },
    });
  };

  const handleEndSoloAccess = () => {
    if (!tenant) return;
    const existingMeta = (tenant.metadata ?? {}) as Record<string, unknown>;
    const newMeta = { ...existingMeta, academy_notes: formNotes || null };
    saveMutation.mutate({
      tenantId: tenant.id,
      data: {
        lifecycleAction: "end",
        academy_access_enabled: false,
        academy_solo: true,
        academy_max_users: formMaxUsers === "" ? null : (formMaxUsers as number),
        academy_subscription_expires_at: formExpires ? formExpires.toISOString() : null,
        metadata: newMeta,
      },
    });
  };

  // Academy Users tab — filter the shared enrolments query down to this tenant.
  const { data: allEnrollments = [], isLoading: enrollmentsLoading } = useAdminEnrollments();
  const tenantEnrollments = useMemo(
    () => allEnrollments.filter((e) => e.tenant_id === tenantIdNum),
    [allEnrollments, tenantIdNum],
  );

  const statusChip = useCallback((status: string | null, expiresAt: string | null) => {
    const expired = status === "active" && !!expiresAt && new Date(expiresAt).getTime() <= Date.now();
    const label = expired ? "expired" : status || "—";
    let tone = "bg-muted text-muted-foreground";
    if (expired) tone = "bg-red-100 text-red-700";
    else if (status === "active") tone = "bg-green-100 text-green-700";
    else if (status === "completed") tone = "bg-blue-100 text-blue-700";
    else if (status === "revoked") tone = "bg-red-100 text-red-700";
    return (
      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize", tone)}>
        {label}
      </span>
    );
  }, []);

  const getAccessBadge = () => {
    if (!tenant) return null;
    if (!tenant.academy_access_enabled)
      return <Badge variant="secondary" className="text-muted-foreground">Disabled</Badge>;
    if (tenant.academy_subscription_expires_at) {
      const exp = new Date(tenant.academy_subscription_expires_at);
      if (isAfter(exp, now) && isBefore(exp, thirtyDaysFromNow))
        return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Expiring Soon</Badge>;
    }
    return <Badge className="bg-green-100 text-green-700 border-green-200">Enabled</Badge>;
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Tenant not found.</p>
        <Button variant="outline" onClick={() => navigate("/superadmin/academy/tenant-access")}>
          Back to Academy Customers
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 -ml-2"
            onClick={() => navigate("/superadmin/academy/tenant-access")}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">{tenant.name}</h1>
            {isAcademySoloTenant(tenant.metadata) && (
              <Badge variant="outline" className="border-primary/30 text-primary">Academy Solo</Badge>
            )}
            {getAccessBadge()}
          </div>
        </div>
        <ViewAsClientButton
          tenantId={tenant.id}
          tenantName={tenant.name}
          tenantType={((tenant.tenant_type as TenantType) || "compliance_system")}
        />
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="settings" className="gap-1.5"><Settings2 className="h-4 w-4" /> Settings</TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5"><Users className="h-4 w-4" /> Academy Users</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1.5"><BarChart3 className="h-4 w-4" /> Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-6 py-4">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Academy Solo pilot</p>
            <p className="mt-1">
              Use an existing named user or invite a new Academy User. This action changes protected Academy access,
              never creates a package, RTO record, or payment.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Academy Access</Label>
            <Switch checked={formAccess} onCheckedChange={setFormAccess} />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label className="text-base font-medium">Academy Solo pilot</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Explicitly mark this tenant for the one-user manual Solo lifecycle. Leave off for existing RTO Academy access.
              </p>
            </div>
            <Switch
              checked={formSoloPilot}
              onCheckedChange={(checked) => {
                if (checked && !formSoloPilot) setSoloPilotPreviousMaxUsers(formMaxUsers);
                setFormSoloPilot(checked);
                setFormMaxUsers(checked ? 1 : (soloPilotPreviousMaxUsers ?? ""));
                if (!checked) setSoloPilotPreviousMaxUsers(null);
              }}
            />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => setShowInvite(true)}
            disabled={!formSoloPilot || !formAccess || !persistedSoloPilot}
          >
            <UserPlus className="h-4 w-4" />
            Invite Academy User
          </Button>
          {(!formSoloPilot || !formAccess || !persistedSoloPilot) && (
            <p className="-mt-4 text-xs text-muted-foreground">
              Save an enabled Academy Solo pilot before inviting its named learner.
            </p>
          )}

          <div className="space-y-2">
            <Label>Maximum Users</Label>
            <Input
              type="number"
              min={0}
              value={formMaxUsers}
              onChange={(e) => setFormMaxUsers(e.target.value === "" ? "" : parseInt(e.target.value))}
              placeholder="Unlimited"
              disabled={formSoloPilot}
            />
            <p className="text-xs text-muted-foreground">
              {formSoloPilot ? "Academy Solo is limited to one named learner" : "Maximum number of users from this account who can be enrolled simultaneously"}
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

          {formSoloPilot ? (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Solo catalogue policy</p>
              <p className="mt-1">This account receives all published Academy courses through its Academy entitlement. Package mappings and automatic package enrolment do not apply.</p>
            </div>
          ) : (
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
                        {allPackages.map((p) => (
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
                        {allCourses.map((c) => (
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
          )}

          <div className="flex items-center justify-end gap-2 border-t pt-4">
            {persistedSoloPilot && (
              <Button variant="destructive" onClick={handleEndSoloAccess} disabled={saveMutation.isPending}>
                End Solo Access
              </Button>
            )}
            <Button onClick={handleSaveSettings} disabled={saveMutation.isPending}>
              Save Settings
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="users" className="py-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Learner</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Enrolled</TableHead>
                    <TableHead>Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrollmentsLoading &&
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 5 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))}
                  {!enrollmentsLoading && tenantEnrollments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        No Academy users enrolled yet
                      </TableCell>
                    </TableRow>
                  )}
                  {!enrollmentsLoading && tenantEnrollments.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{e.user ? `${e.user.first_name} ${e.user.last_name}` : "—"}</span>
                          <span className="text-xs text-muted-foreground">{e.user?.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>{e.course?.title ?? "—"}</TableCell>
                      <TableCell>{statusChip(e.status, e.expires_at)}</TableCell>
                      <TableCell>{e.enrolled_at ? format(new Date(e.enrolled_at), "dd MMM yyyy") : "—"}</TableCell>
                      <TableCell>{e.completed_at ? format(new Date(e.completed_at), "dd MMM yyyy") : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="py-4">
          <AcademyActivityDashboard tenantId={tenant.id} />
        </TabsContent>
      </Tabs>

      <TenantInviteDialog
        open={showInvite}
        onOpenChange={setShowInvite}
        tenantId={tenant.id}
        tenantName={tenant.name}
        initialRelationshipRole="academy_user"
        sendInvitationByDefault
        onSuccess={() => setShowInvite(false)}
      />
    </div>
  );
}
