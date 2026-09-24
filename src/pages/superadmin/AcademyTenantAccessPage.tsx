import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { format, addDays, startOfMonth, endOfMonth, addMonths, isAfter, isBefore } from "date-fns";
import { Search, Shield, ShieldOff, Clock, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import AcademyStatCard from "@/components/academy/admin/AcademyStatCard";
import { CreateAcademySoloDialog, type AcademySoloLearnerDetails } from "@/components/academy/admin/CreateAcademySoloDialog";
import {
  type AcademySoloAccountCreation,
  useTenantSummaries,
  useToggleTenantAccess,
  type TenantRow,
} from "@/hooks/academy/useTenantAcademyAccess";
import { useAcademyUserTenantMatches } from "@/hooks/academy/useAcademyUserSearch";
import { isAcademySoloTenant } from "@/lib/tenantAccountSurface";
import { usePermission } from "@/hooks/usePermission";
import { TenantInviteDialog } from "@/components/client/TenantInviteDialog";

type StatusTab = "all" | "enabled" | "disabled" | "expiring";
type AccountTypeTab = "all" | "rto" | "academy_solo";

export default function AcademyTenantAccessPage() {
  const canManage = usePermission('academy.tenant_access.manage');
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [accountTypeTab, setAccountTypeTab] = useState<AccountTypeTab>("all");
  const [showCreateSolo, setShowCreateSolo] = useState(false);
  const [soloInvite, setSoloInvite] = useState<{
    account: AcademySoloAccountCreation;
    learner: AcademySoloLearnerDetails;
  } | null>(null);
  const [timelineMonth, setTimelineMonth] = useState<string | null>(null);

  // Snapshot once per mount (not per render) so the memos below actually memoize.
  const now = useMemo(() => new Date(), []);
  const thirtyDaysFromNow = useMemo(() => addDays(now, 30), [now]);

  // ── Data hooks ──
  const { data: tenants = [], isLoading } = useTenantSummaries();
  const toggleMutation = useToggleTenantAccess();
  const { data: userMatches = new Map() } = useAcademyUserTenantMatches(search);

  // ── Computed stats ──
  const stats = useMemo(() => {
    const withAccess = tenants.filter((t) => t.academy_access_enabled).length;
    const withoutAccess = tenants.length - withAccess;
    const expiring = tenants.filter((t) => {
      if (!t.academy_subscription_expires_at) return false;
      const exp = new Date(t.academy_subscription_expires_at);
      return isAfter(exp, now) && isBefore(exp, thirtyDaysFromNow);
    }).length;
    const rtoCount = tenants.filter((t) => !isAcademySoloTenant(t.metadata)).length;
    const academySoloCount = tenants.length - rtoCount;
    return { withAccess, withoutAccess, expiring, rtoCount, academySoloCount };
  }, [tenants, now, thirtyDaysFromNow]);

  // ── Filter logic ──
  const filtered = useMemo(() => {
    let list = tenants;
    if (accountTypeTab === "rto") list = list.filter((t) => !isAcademySoloTenant(t.metadata));
    else if (accountTypeTab === "academy_solo") list = list.filter((t) => isAcademySoloTenant(t.metadata));
    if (search) {
      const q = search.toLowerCase();
      // A tenant matches either by its own name, or because one of its
      // users matched the search (see useAcademyUserTenantMatches) — the
      // latter is what the "↳ Matched:" subtext below explains to staff.
      list = list.filter((t) => t.name.toLowerCase().includes(q) || userMatches.has(t.id));
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
  }, [tenants, accountTypeTab, search, userMatches, statusTab, timelineMonth, now, thirtyDaysFromNow]);

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
  }, [tenants, now]);

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
    <>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Academy Customers</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Manage Academy access without routing Solo customers through the RTO client workflow
              </p>
            </div>
            {canManage && (
              <Button onClick={() => setShowCreateSolo(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Create Academy Solo
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <AcademyStatCard label="Accounts with Access" value={stats.withAccess} icon={<Shield className="h-5 w-5 text-primary" />} loading={isLoading} />
          <AcademyStatCard label="Accounts without Access" value={stats.withoutAccess} icon={<ShieldOff className="h-5 w-5 text-muted-foreground" />} loading={isLoading} />
          <AcademyStatCard label="Expiring This Month" value={stats.expiring} icon={<Clock className="h-5 w-5 text-orange-500" />} loading={isLoading} />
        </div>

        {/* Account type toggle — RTO clients with Academy access enabled vs
            standalone Vivacity Academy Solo accounts. Its own row so it
            doesn't compete for space with the search box and status tabs. */}
        <div className="flex gap-1 border rounded-lg p-1 bg-muted/30 w-fit">
          {([
            { value: "all" as const, label: "All" },
            { value: "rto" as const, label: `RTO Clients (${stats.rtoCount})` },
            { value: "academy_solo" as const, label: `Academy Solo (${stats.academySoloCount})` },
          ]).map((tab) => (
            <button
              key={tab.value}
              onClick={() => setAccountTypeTab(tab.value)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors font-medium",
                accountTypeTab === tab.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search tenant or Academy user name/email…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
                  <TableHead>Account Name</TableHead>
                  <TableHead>Access Status</TableHead>
                  <TableHead className="text-center">Max Users</TableHead>
                  <TableHead className="text-center">Enrolled</TableHead>
                  <TableHead>Subscription Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))}

                {!isLoading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      No tenants found
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading && filtered.map((t) => {
                  const matchedUsers = search ? userMatches.get(t.id) : undefined;
                  return (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer hover:bg-primary/5 transition-colors"
                    onClick={() => navigate(`/superadmin/academy/tenant/${t.id}`)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{t.name}</span>
                        {isAcademySoloTenant(t.metadata) && (
                          <Badge variant="outline" className="border-primary/30 text-primary">Academy Solo</Badge>
                        )}
                      </div>
                      {matchedUsers && matchedUsers.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          ↳ Matched: {matchedUsers.map((u) => `${u.full_name} (${u.email})`).join(", ")}
                        </p>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={t.academy_access_enabled}
                          disabled={!canManage}
                          onCheckedChange={(checked) => {
                            if (!canManage) return;
                            toggleMutation.mutate({ id: t.id, enabled: checked });
                          }}
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
                  </TableRow>
                  );
                })}
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

      <CreateAcademySoloDialog
        open={showCreateSolo}
        onOpenChange={setShowCreateSolo}
        onCreated={(account, learner) => setSoloInvite({ account, learner })}
      />

      {soloInvite && (
        <TenantInviteDialog
          open
          onOpenChange={(open) => { if (!open) setSoloInvite(null); }}
          tenantId={soloInvite.account.tenant_id}
          tenantName={soloInvite.account.account_name}
          initialRelationshipRole="academy_user"
          sendInvitationByDefault
          academySolo
          initialFirstName={soloInvite.learner.firstName}
          initialLastName={soloInvite.learner.lastName}
          initialEmail={soloInvite.learner.email}
          onSuccess={() => setSoloInvite(null)}
        />
      )}
    </>
  );
}
