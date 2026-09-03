import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, AlertCircle, CheckCircle2, Loader2, Pencil, MailCheck, Sparkles } from "lucide-react";
import {
  type RelationshipRole,
  RELATIONSHIP_ROLE_OPTIONS,
  relationshipRoleLabel,
  unicornRoleFromRelationship,
  isValidEmail,
} from "@/lib/roles/relationshipRole";

type LaunchRow = {
  tenant_id: number;
  tenant_name: string;
  tier_name: string;
  package_code: string;
  suggested_email: string | null;
  suggested_first_name: string | null;
  suggested_last_name: string | null;
  /** Legacy unicorn_role of the suggested user (kept for the email payload). */
  suggested_unicorn_role: string | null;
  /** New canonical role from tenant_users.relationship_role. */
  suggested_relationship_role: RelationshipRole | null;
  suggested_user_id: string | null;
};

type Override = {
  email: string;
  first_name: string;
  last_name: string;
  unicorn_role: "Admin" | "User";
  relationship_role: RelationshipRole;
};

type LiveStatus = "queued" | "sent" | "skipped" | "failed";

interface BulkSendDetail {
  tenant_id: number;
  outcome: LiveStatus;
  code?: string;
  detail?: string;
}

interface BulkSendResponse {
  ok: boolean;
  detail?: string;
  partial_failure?: boolean;
  details?: BulkSendDetail[];
  summary: { sent: number; skipped: number; failed: number };
}

type TenantUserOption = {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  unicorn_role: string | null;
  relationship_role: RelationshipRole | null;
  created_at: string;
};

const BRAND = {
  purple: "#7130A0",
  fuchsia: "#ed1878",
  cyan: "#23c0dd",
  cyanDark: "#1ba3bd",
  acai: "#44235F",
  lightPurple: "#DFD8E8",
};

export default function BulkInvite() {
  const { profile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [rows, setRows] = useState<LaunchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [overrides, setOverrides] = useState<Map<number, Override>>(new Map());
  const [overrideOpenFor, setOverrideOpenFor] = useState<LaunchRow | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [sending, setSending] = useState(false);
  const [liveStatus, setLiveStatus] = useState<Map<number, LiveStatus>>(new Map());
  const [pollHandle, setPollHandle] = useState<number | null>(null);

  const isSuperAdmin = profile?.unicorn_role === "Super Admin";

  // Load Superhero membership tenants
  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // 1. Membership packages (filter source — package_type='membership')
        const { data: memberPkgs, error: pkErr } = await supabase
          .from("packages")
          .select("id, name, full_text")
          .eq("package_type", "membership");
        if (pkErr) throw pkErr;
        const pkgInfo = new Map<number, { tier_name: string; package_code: string }>();
        (memberPkgs || []).forEach((p) => pkgInfo.set(p.id, { tier_name: p.full_text || "Membership", package_code: p.name || "M" }));
        const memberPkgIds = Array.from(pkgInfo.keys());
        if (memberPkgIds.length === 0) { if (!cancelled) setRows([]); return; }

        // 2. Active package_instances on those packages
        const { data: pkgInstances, error: piErr } = await supabase
          .from("package_instances")
          .select("tenant_id, package_id")
          .eq("is_active", true)
          .in("package_id", memberPkgIds);
        if (piErr) throw piErr;

        const tierByTenant = new Map<number, { tier_name: string; package_code: string }>();
        for (const pi of pkgInstances || []) {
          if (!tierByTenant.has(pi.tenant_id)) {
            const info = pkgInfo.get(pi.package_id);
            if (info) tierByTenant.set(pi.tenant_id, info);
          }
        }

        const tenantIds = Array.from(tierByTenant.keys());
        if (tenantIds.length === 0) {
          if (!cancelled) setRows([]);
          return;
        }

        // 2. Active tenants only
        const { data: tenants, error: tErr } = await supabase
          .from("tenants")
          .select("id, name")
          .in("id", tenantIds)
          .eq("status", "active");
        if (tErr) throw tErr;

        const activeIds = (tenants || []).map((t) => t.id);
        const tenantNameMap = new Map<number, string>();
        (tenants || []).forEach((t) => tenantNameMap.set(t.id, t.name));

        // 3. Most recent relationship_role='primary_contact' tenant_users row per tenant
        const { data: tus } = await supabase
          .from("tenant_users")
          .select("tenant_id, user_id, relationship_role, created_at")
          .in("tenant_id", activeIds)
          .eq("relationship_role", "primary_contact")
          .order("created_at", { ascending: false });

        const pickedTu = new Map<number, { user_id: string; relationship_role: RelationshipRole | null }>();
        for (const tu of tus || []) {
          if (!pickedTu.has(tu.tenant_id)) pickedTu.set(tu.tenant_id, { user_id: tu.user_id, relationship_role: tu.relationship_role as RelationshipRole | null });
        }

        const userIds = Array.from(pickedTu.values()).map((v) => v.user_id).filter(Boolean);
        const userMap = new Map<string, { user_uuid: string; email: string; first_name: string | null; last_name: string | null; unicorn_role: string | null }>();
        if (userIds.length > 0) {
          const { data: users } = await supabase
            .from("users")
            .select("user_uuid, email, first_name, last_name, unicorn_role")
            .in("user_uuid", userIds);
          (users || []).forEach((u) => userMap.set(u.user_uuid, u));
        }

        const launchRows: LaunchRow[] = activeIds
          .map((tid) => {
            const tier = tierByTenant.get(tid)!;
            const tu = pickedTu.get(tid);
            const u = tu ? userMap.get(tu.user_id) : null;
            return {
              tenant_id: tid,
              tenant_name: tenantNameMap.get(tid) || `Tenant ${tid}`,
              tier_name: tier.tier_name,
              package_code: tier.package_code,
              suggested_email: u?.email ?? null,
              suggested_first_name: u?.first_name ?? null,
              suggested_last_name: u?.last_name ?? null,
              suggested_unicorn_role: u?.unicorn_role ?? null,
              suggested_relationship_role: tu?.relationship_role ?? null,
              suggested_user_id: tu?.user_id ?? null,
            };
          })
          .sort((a, b) => a.tenant_name.localeCompare(b.tenant_name));

        if (!cancelled) {
          setRows(launchRows);
          // Pre-select rows with a valid email
          const preselect = new Set<number>();
          launchRows.forEach((r) => { if (r.suggested_email) preselect.add(r.tenant_id); });
          setSelected(preselect);
        }
      } catch (e) {
        console.error(e);
        toast({ title: "Failed to load launch list", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isSuperAdmin, toast]);

  const effectiveContact = useCallback((r: LaunchRow): {
    email: string;
    first_name: string;
    last_name: string;
    relationship_role: RelationshipRole;
    unicorn_role: string;
  } | null => {
    const ov = overrides.get(r.tenant_id);
    if (ov) return {
      email: ov.email,
      first_name: ov.first_name,
      last_name: ov.last_name || "-",
      relationship_role: ov.relationship_role,
      unicorn_role: ov.unicorn_role,
    };
    if (r.suggested_email) {
      return {
        email: r.suggested_email,
        first_name: r.suggested_first_name || "there",
        last_name: r.suggested_last_name || "-",
        // Backfill ensures every active tenant has a primary_contact; default to that.
        relationship_role: r.suggested_relationship_role || "primary_contact",
        unicorn_role: r.suggested_unicorn_role || "Admin",
      };
    }
    return null;
  }, [overrides]);

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.tenant_id)), [rows, selected]);
  const selectableCount = rows.filter((r) => effectiveContact(r) !== null).length;
  const etaSeconds = Math.max(0, selectedRows.length - 1) * 3;

  const toggleAll = () => {
    if (selected.size === selectableCount) {
      setSelected(new Set());
    } else {
      const next = new Set<number>();
      rows.forEach((r) => { if (effectiveContact(r)) next.add(r.tenant_id); });
      setSelected(next);
    }
  };

  const toggleOne = (tid: number) => {
    const next = new Set(selected);
    if (next.has(tid)) next.delete(tid);
    else next.add(tid);
    setSelected(next);
  };

  // Build email preview HTML for the first selected row
  const previewVariables = useMemo(() => {
    const r = selectedRows[0];
    if (!r) return null;
    const c = effectiveContact(r);
    if (!c) return null;
    const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const dd = String(expiry.getDate()).padStart(2, "0");
    const mm = String(expiry.getMonth() + 1).padStart(2, "0");
    return {
      first_name: c.first_name,
      tenant_name: r.tenant_name,
      role_label: relationshipRoleLabel(c.relationship_role),
      inviter_name: profile ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "The Vivacity team" : "The Vivacity team",
      expiry_date: `${dd}/${mm}/${expiry.getFullYear()}`,
      invite_url: "https://unicorn-cms.au/accept-invitation?token=…",
    };
  }, [selectedRows, profile, effectiveContact]);

  const handleSend = async () => {
    setSending(true);
    setLiveStatus(new Map(selectedRows.map((r) => [r.tenant_id, "queued" as LiveStatus])));

    // Start polling user_invitations every 10s for live pill updates
    const tenantIdList = selectedRows.map((r) => r.tenant_id);
    const startedAt = new Date(Date.now() - 60 * 1000).toISOString(); // small backdate buffer
    const handle = window.setInterval(async () => {
      if (tenantIdList.length === 0) return;
      const { data } = await supabase
        .from("user_invitations")
        .select("tenant_id, status, created_at")
        .in("tenant_id", tenantIdList)
        .gte("created_at", startedAt);
      if (!data) return;
      setLiveStatus((prev) => {
        const next = new Map(prev);
        for (const row of data) {
          if (next.get(row.tenant_id) === "queued") {
            if (row.status === "pending" || row.status === "sent") next.set(row.tenant_id, "sent");
            else if (row.status === "failed") next.set(row.tenant_id, "failed");
          }
        }
        return next;
      });
    }, 10000) as unknown as number;
    setPollHandle(handle);

    try {
      const overridesPayload: Record<string, Override> = {};
      for (const r of selectedRows) {
        const ov = overrides.get(r.tenant_id);
        if (ov) overridesPayload[String(r.tenant_id)] = ov;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const { data, error } = await supabase.functions.invoke<BulkSendResponse>("bulk-send-invitations", {
        body: { tenant_ids: tenantIdList, contact_overrides: overridesPayload },
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (error || !data?.ok) {
        throw new Error(error?.message || data?.detail || "Bulk send failed");
      }

      // Final reconcile from response.details
      setLiveStatus((prev) => {
        const next = new Map(prev);
        for (const d of data.details || []) {
          next.set(d.tenant_id, d.outcome as LiveStatus);
        }
        return next;
      });

      // Surface any per-row PRIMARY_EXISTS conflicts (HTTP 409 from invite-user)
      // so the operator can fix the affected tenant and retry — non-blocking.
      const primaryExistsRows = (data.details || []).filter(
        (d) => d.code === "PRIMARY_EXISTS" || /primary.*exist/i.test(d.detail || ""),
      );
      for (const d of primaryExistsRows) {
        const r = selectedRows.find((row) => row.tenant_id === d.tenant_id);
        toast({
          title: r ? `Primary contact conflict — ${r.tenant_name}` : "Primary contact conflict",
          description: d.detail || "This tenant already has a primary contact.",
          variant: "destructive",
        });
      }

      const s = data.summary;
      toast({
        title: data.partial_failure ? "Bulk send partial" : "Bulk send complete",
        description: `Sent ${s.sent} · Skipped ${s.skipped} · Failed ${s.failed}`,
      });
    } catch (e) {
      console.error(e);
      toast({ title: "Bulk send failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSending(false);
      setConfirmOpen(false);
      if (pollHandle) {
        window.clearInterval(pollHandle);
        setPollHandle(null);
      }
      window.clearInterval(handle);
    }
  };

  useEffect(() => () => { if (pollHandle) window.clearInterval(pollHandle); }, [pollHandle]);

  // Access control — wait for the profile to resolve, then check ONLY unicorn_role.
  // Do NOT add is_team / tenant_id / user_type checks; unicorn_role is authoritative.
  // Render-time guard (not useEffect) so we never flash content or fire a redirect
  // on the transient null-profile state while useAuth's deferred profile fetch runs.
  // (Placed after all hook calls above -- not before -- so hook call order never
  // changes between renders; every effect/memo above already no-ops internally via
  // `isSuperAdmin` for a non-Super-Admin profile, so deferring this check changes
  // no observable behavior.)
  if (authLoading || profile === null || profile === undefined) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (profile.unicorn_role !== "Super Admin") {
    return <Navigate to="/dashboard" replace />;
  }

  if (authLoading || loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 p-6 animate-fade-in">
        {/* Hero */}
        <div
          className="rounded-2xl p-8 text-white shadow-lg"
          style={{ background: `linear-gradient(135deg, ${BRAND.purple} 0%, ${BRAND.fuchsia} 100%)` }}
        >
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="h-6 w-6" />
            <span className="text-sm font-semibold uppercase tracking-wider opacity-90">SuperAdmin · Bulk Invite</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2 tracking-tight">
            Monday Superhero Launch
          </h1>
          <p className="text-base opacity-95 max-w-2xl">
            Send invitations to the primary contact of every active Superhero member tenant. Each invitation expires in 7 days. Sends throttled at 20/min.
          </p>
        </div>

        {/* Section 1 — Launch list */}
        <Card style={{ backgroundColor: BRAND.lightPurple + "55" }}>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle style={{ color: BRAND.purple }}>Launch list</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{rows.length} active Superhero member tenants</p>
            </div>
            <div className="text-sm font-semibold" style={{ color: BRAND.acai }}>
              {selected.size} of {rows.length} tenants selected for invitation
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selected.size === selectableCount && selectableCount > 0}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Suggested contact</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Override</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const c = effectiveContact(r);
                    const overridden = overrides.has(r.tenant_id);
                    const status = liveStatus.get(r.tenant_id);
                    return (
                      <TableRow key={r.tenant_id} className={!c ? "opacity-60" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(r.tenant_id)}
                            disabled={!c || sending}
                            onCheckedChange={() => toggleOne(r.tenant_id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium" style={{ color: BRAND.acai }}>
                          {r.tenant_name}
                          {status && (
                            <Badge
                              className="ml-2 text-xs"
                              variant={status === "sent" ? "default" : status === "failed" ? "destructive" : "secondary"}
                            >
                              {status}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" style={{ borderColor: BRAND.fuchsia, color: BRAND.fuchsia }}>
                            {r.tier_name}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {c ? (
                            <div className="flex flex-col">
                              <span className="font-medium">{c.first_name} {c.last_name === "-" ? "" : c.last_name}</span>
                              <span className="text-xs text-muted-foreground">{c.email}</span>
                              {overridden && <span className="text-[11px] mt-0.5" style={{ color: BRAND.fuchsia }}>Overridden</span>}
                            </div>
                          ) : (
                            <span className="text-sm font-medium text-destructive">No contact — set one before sending</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {c ? <Badge variant="secondary">{relationshipRoleLabel(c.relationship_role)}</Badge> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => setOverrideOpenFor(r)} disabled={sending}>
                            <Pencil className="h-3.5 w-3.5 mr-1" /> Override
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Section 2 — Preview + What will happen */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle style={{ color: BRAND.purple }}>Email preview</CardTitle>
              <p className="text-xs text-muted-foreground">First selected recipient — variables substituted from live data</p>
            </CardHeader>
            <CardContent>
              {previewVariables ? (
                <div className="rounded-lg border bg-white p-5 text-sm space-y-3" style={{ color: BRAND.acai }}>
                  <p>Hi <strong>{previewVariables.first_name}</strong>,</p>
                  <p>
                    <strong>{previewVariables.inviter_name}</strong> has invited you to join <strong>{previewVariables.tenant_name}</strong> on Unicorn as a <strong>{previewVariables.role_label}</strong>.
                  </p>
                  <p>
                    <a href="#" className="underline" style={{ color: BRAND.cyan }}>{previewVariables.invite_url}</a>
                  </p>
                  <p className="text-xs text-muted-foreground">This invitation expires on {previewVariables.expiry_date} (7 days).</p>
                  <p className="text-xs text-muted-foreground italic">Template: unicorn_accept_invite_v1</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Select at least one tenant to preview.</p>
              )}
            </CardContent>
          </Card>

          <Card style={{ borderColor: BRAND.cyan, borderWidth: 1 }}>
            <CardHeader>
              <CardTitle style={{ color: BRAND.purple }}>What will happen</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm" style={{ color: BRAND.acai }}>
                <li>Will send: <strong>{selectedRows.length}</strong> invitations</li>
                <li>From: <code className="text-xs">noreply@mg.unicorn-cms.au</code></li>
                <li>Template: <code className="text-xs">unicorn_accept_invite_v1</code></li>
                <li>Expiry: 7 days from send time</li>
                <li>Throttle: 20/minute (3s between sends)</li>
                <li>Estimated total send time: <strong>~{Math.ceil(etaSeconds / 60) || 1} min ({etaSeconds}s)</strong></li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Section 3 — Send */}
        <div className="flex justify-end">
          <Button
            size="lg"
            disabled={selectedRows.length === 0 || sending}
            onClick={() => { setConfirmText(""); setConfirmOpen(true); }}
            style={{ backgroundColor: BRAND.cyan, color: "white" }}
            className="hover:opacity-90"
          >
            {sending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</>) : (<><Send className="h-4 w-4 mr-2" /> Send {selectedRows.length} invitations now</>)}
          </Button>
        </div>
      </div>

      {/* Override modal */}
      <OverrideModal
        row={overrideOpenFor}
        existingOverride={overrideOpenFor ? overrides.get(overrideOpenFor.tenant_id) : undefined}
        onClose={() => setOverrideOpenFor(null)}
        onClear={(tid) => {
          const next = new Map(overrides);
          next.delete(tid);
          setOverrides(next);
        }}
        onSave={(tid, ov) => {
          const next = new Map(overrides);
          next.set(tid, ov);
          setOverrides(next);
        }}
      />

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!sending) setConfirmOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm bulk send</DialogTitle>
            <DialogDescription>
              This will create <strong>{selectedRows.length}</strong> rows in <code>user_invitations</code> and send <strong>{selectedRows.length}</strong> emails via Mailgun. Each invitation expires in 7 days. The action cannot be undone, but invitations can be individually revoked from the Invitations dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="my-2 space-y-2">
            <p className="text-sm">Type <code className="px-1 bg-muted rounded">SEND</code> to confirm.</p>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="SEND" disabled={sending} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={sending}>Cancel</Button>
            <Button
              onClick={handleSend}
              disabled={confirmText !== "SEND" || sending}
              style={{ backgroundColor: BRAND.cyan, color: "white" }}
            >
              {sending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</> : <><MailCheck className="h-4 w-4 mr-2" /> Send now</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---- Override modal -----------------------------------------------------

function OverrideModal({
  row,
  existingOverride,
  onClose,
  onSave,
  onClear,
}: {
  row: LaunchRow | null;
  existingOverride?: Override;
  onClose: () => void;
  onSave: (tid: number, ov: Override) => void;
  onClear: (tid: number) => void;
}) {
  const [members, setMembers] = useState<TenantUserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"existing" | "new">("existing");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newRelationshipRole, setNewRelationshipRole] = useState<RelationshipRole>("primary_contact");
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setSelectedUserId(null);
    setNewEmail(existingOverride?.email || "");
    setNewFirst(existingOverride?.first_name || "");
    setNewLast(existingOverride?.last_name || "");
    setNewRelationshipRole(existingOverride?.relationship_role || "primary_contact");
    setEmailError(null);
    setTab("existing");
    (async () => {
      setLoading(true);
      try {
        const { data: tus } = await supabase
          .from("tenant_users")
          .select("user_id, relationship_role, created_at")
          .eq("tenant_id", row.tenant_id)
          .order("created_at", { ascending: false });
        const uids = (tus || []).map((t) => t.user_id).filter(Boolean);
        if (uids.length === 0) { setMembers([]); return; }
        const { data: users } = await supabase
          .from("users")
          .select("user_uuid, email, first_name, last_name, unicorn_role")
          .in("user_uuid", uids);
        const userMap = new Map<string, { user_uuid: string; email: string; first_name: string | null; last_name: string | null; unicorn_role: string | null }>();
        (users || []).forEach((u) => userMap.set(u.user_uuid, u));
        const opts: TenantUserOption[] = (tus || [])
          .map((t) => {
            const u = userMap.get(t.user_id);
            if (!u) return null;
            return {
              user_id: t.user_id,
              email: u.email,
              first_name: u.first_name,
              last_name: u.last_name,
              unicorn_role: u.unicorn_role,
              relationship_role: (t.relationship_role as RelationshipRole | null) ?? null,
              created_at: t.created_at,
            } as TenantUserOption;
          })
          .filter(Boolean) as TenantUserOption[];
        // Surface primary_contact rows first.
        opts.sort((a, b) => {
          const ap = a.relationship_role === "primary_contact" ? 0 : 1;
          const bp = b.relationship_role === "primary_contact" ? 0 : 1;
          return ap - bp;
        });
        setMembers(opts);
      } finally {
        setLoading(false);
      }
    })();
    // Intentionally scoped to tenant identity, not the full `row`/`existingOverride`
    // objects: this resets the form when the modal opens for a *different* tenant,
    // not on every parent re-render that produces a new object reference for the
    // same tenant -- which would otherwise wipe in-progress edits mid-keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.tenant_id]);

  if (!row) return null;

  const saveExisting = () => {
    const m = members.find((x) => x.user_id === selectedUserId);
    if (!m) return;
    // Default existing-user override to the user's current relationship role,
    // falling back to primary_contact (the launch list is keyed off primary).
    const rr: RelationshipRole = m.relationship_role || "primary_contact";
    onSave(row.tenant_id, {
      email: m.email,
      first_name: m.first_name || "there",
      last_name: m.last_name || "-",
      relationship_role: rr,
      unicorn_role: unicornRoleFromRelationship(rr),
    });
    onClose();
  };

  const saveNew = () => {
    if (!newEmail.trim() || !newFirst.trim()) return;
    if (!isValidEmail(newEmail)) {
      setEmailError("Enter a valid email address (e.g. name@example.com).");
      return;
    }
    setEmailError(null);
    onSave(row.tenant_id, {
      email: newEmail.trim().toLowerCase(),
      first_name: newFirst.trim(),
      last_name: newLast.trim() || "-",
      relationship_role: newRelationshipRole,
      unicorn_role: unicornRoleFromRelationship(newRelationshipRole),
    });
    onClose();
  };

  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Override contact for {row.tenant_name}</DialogTitle>
          <DialogDescription>Pick a different existing tenant user, or type a new contact.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "existing" | "new")}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="existing">Existing tenant users ({members.length})</TabsTrigger>
            <TabsTrigger value="new">Type a new contact</TabsTrigger>
          </TabsList>
          <TabsContent value="existing" className="mt-4">
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : members.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tenant users on this tenant. Use the "new contact" tab.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto space-y-2">
                {members.map((m) => (
                  <label
                    key={m.user_id}
                    className={`flex items-center justify-between gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedUserId === m.user_id ? "border-2" : ""}`}
                    style={selectedUserId === m.user_id ? { borderColor: BRAND.cyan, backgroundColor: BRAND.lightPurple + "44" } : undefined}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="member"
                        checked={selectedUserId === m.user_id}
                        onChange={() => setSelectedUserId(m.user_id)}
                        className="mt-1"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium" style={{ color: BRAND.acai }}>{m.first_name} {m.last_name || ""}</span>
                          {m.relationship_role === "primary_contact" && (
                            <Badge style={{ backgroundColor: BRAND.fuchsia, color: "white" }}>Primary</Badge>
                          )}
                          {m.relationship_role === "secondary_contact" && (
                            <Badge variant="outline">Secondary</Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">{m.email}</span>
                      </div>
                    </div>
                    <Badge variant="outline">{relationshipRoleLabel(m.relationship_role)}</Badge>
                  </label>
                ))}
              </div>
            )}
            <DialogFooter className="mt-4">
              {existingOverride && (
                <Button variant="ghost" onClick={() => { onClear(row.tenant_id); onClose(); }}>Clear override</Button>
              )}
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={saveExisting} disabled={!selectedUserId} style={{ backgroundColor: BRAND.cyan, color: "white" }}>Use this contact</Button>
            </DialogFooter>
          </TabsContent>
          <TabsContent value="new" className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">First name</label>
                <Input value={newFirst} onChange={(e) => setNewFirst(e.target.value)} placeholder="Angela" />
              </div>
              <div>
                <label className="text-xs font-medium">Last name</label>
                <Input value={newLast} onChange={(e) => setNewLast(e.target.value)} placeholder="Smith" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">Email</label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => { setNewEmail(e.target.value); if (emailError) setEmailError(null); }}
                placeholder="contact@example.com"
                aria-invalid={!!emailError}
              />
              {emailError && <p className="text-xs text-destructive mt-1">{emailError}</p>}
            </div>
            <div>
              <label className="text-xs font-medium">Role</label>
              <Select value={newRelationshipRole} onValueChange={(v) => setNewRelationshipRole(v as RelationshipRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col">
                        <span>{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              {existingOverride && (
                <Button variant="ghost" onClick={() => { onClear(row.tenant_id); onClose(); }}>Clear override</Button>
              )}
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={saveNew} disabled={!newEmail.trim() || !newFirst.trim()} style={{ backgroundColor: BRAND.cyan, color: "white" }}>Use this contact</Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
