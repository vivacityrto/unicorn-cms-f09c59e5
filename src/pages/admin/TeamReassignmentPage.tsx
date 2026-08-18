import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2, Users, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface CscUser {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  job_title: string | null;
}

interface TenantRow {
  tenant_id: number;
  tenant_name: string;
  assigned_since: string;
}

interface ReassignResult {
  reassigned: number[];
  skipped: { tenant_id: number; reason: string }[];
}

function displayName(u: CscUser | undefined | null) {
  if (!u) return "";
  return [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || "Unnamed";
}

export default function TeamReassignmentPage() {
  const navigate = useNavigate();
  const { profile, isSuperAdmin } = useAuth();
  const allowed = isSuperAdmin() || profile?.unicorn_role === "Team Leader";

  const [cscs, setCscs] = useState<CscUser[]>([]);
  const [loadingCscs, setLoadingCscs] = useState(true);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [toLoad, setToLoad] = useState<number | null>(null);
  const [toCapacity, setToCapacity] = useState<number | null>(null);
  const [loadingCapacity, setLoadingCapacity] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ReassignResult | null>(null);

  // Load active CSCs
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCscs(true);
      const { data, error } = await (supabase as any)
        .from("users")
        .select("user_uuid, first_name, last_name, email, job_title, kpi_pod")
        .eq("is_csc", true)
        .eq("archived", false)
        .eq("disabled", false)
        .or("kpi_pod.is.null,kpi_pod.neq.qa")
        .order("first_name", { ascending: true });
      if (cancelled) return;
      if (error) {
        toast.error("Failed to load CSCs", { description: error.message });
      } else {
        setCscs((data ?? []) as CscUser[]);
      }
      setLoadingCscs(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Load tenants currently primary-assigned to "from"
  useEffect(() => {
    if (!fromId) {
      setTenants([]);
      setSelected(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingTenants(true);
      const { data, error } = await (supabase as any)
        .from("tenant_csc_assignments")
        .select("tenant_id, assigned_since, tenants:tenant_id(name)")
        .eq("csc_user_id", fromId)
        .eq("is_primary", true);
      if (cancelled) return;
      if (error) {
        toast.error("Failed to load assigned clients", { description: error.message });
        setTenants([]);
      } else {
        const rows: TenantRow[] = (data ?? []).map((r: any) => ({
          tenant_id: r.tenant_id,
          tenant_name: r.tenants?.name ?? `Tenant #${r.tenant_id}`,
          assigned_since: r.assigned_since,
        })).sort((a: TenantRow, b: TenantRow) => a.tenant_name.localeCompare(b.tenant_name));
        setTenants(rows);
        setSelected(new Set(rows.map((r) => r.tenant_id))); // default all checked
      }
      setLoadingTenants(false);
    })();
    return () => { cancelled = true; };
  }, [fromId]);

  // Load capacity for "to"
  useEffect(() => {
    if (!toId) {
      setToLoad(null);
      setToCapacity(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingCapacity(true);
      const [loadRes, capRes] = await Promise.all([
        (supabase as any).rpc("compute_consultant_current_load", { p_user_uuid: toId }),
        (supabase as any).rpc("compute_consultant_weekly_capacity", { p_user_uuid: toId }),
      ]);
      if (cancelled) return;
      setToLoad(typeof loadRes.data === "number" ? loadRes.data : null);
      setToCapacity(typeof capRes.data === "number" ? capRes.data : null);
      setLoadingCapacity(false);
    })();
    return () => { cancelled = true; };
  }, [toId]);

  const fromUser = useMemo(() => cscs.find((u) => u.user_uuid === fromId) ?? null, [cscs, fromId]);
  const toUser = useMemo(() => cscs.find((u) => u.user_uuid === toId) ?? null, [cscs, toId]);

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(tenants.map((t) => t.tenant_id)) : new Set());
  };
  const toggleOne = (id: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!fromId || !toId || selected.size === 0) return;
    setSubmitting(true);
    setResult(null);
    const tenant_ids = Array.from(selected);
    const { data, error } = await supabase.functions.invoke("bulk-reassign-team-member", {
      body: { from_user_id: fromId, to_user_id: toId, tenant_ids, role_scope: "primary_csc" },
    });
    setSubmitting(false);
    if (error) {
      toast.error("Reassignment failed", { description: error.message });
      return;
    }
    const r = (data as ReassignResult) ?? { reassigned: [], skipped: [] };
    setResult(r);
    toast.success(`Reassigned ${r.reassigned.length} client${r.reassigned.length === 1 ? "" : "s"}`, {
      description: r.skipped.length ? `${r.skipped.length} skipped — see details below.` : undefined,
    });
    // refresh tenant list to reflect that the rows are no longer under "from"
    if (fromId) {
      setSelected(new Set());
      setTenants((prev) => prev.filter((t) => !r.reassigned.includes(t.tenant_id)));
    }
  };

  if (!allowed) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Access denied</AlertTitle>
            <AlertDescription>
              The Team Reassignment tool is only available to Super Admins and Team Leaders.
            </AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  const selectedCount = selected.size;
  const projectedLoad =
    toLoad !== null && fromId
      ? toLoad + tenants
          .filter((t) => selected.has(t.tenant_id))
          .reduce((_acc) => _acc, 0)
      : null;
  // NOTE: We don't have per-tenant weekly_hours_required reliably available client-side,
  // so we surface current load vs capacity for the destination and flag overload risk
  // qualitatively in the UI text.

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-semibold text-secondary">Team Reassignment</h1>
            <p className="text-sm text-muted-foreground">
              Bulk-move primary CSC clients from one team member to another. Updates both the relationship record and the live capacity column atomically.
            </p>
          </div>
        </div>

        <Card className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Reassign from</Label>
              <Select value={fromId ?? undefined} onValueChange={(v) => { setFromId(v); setResult(null); }} disabled={loadingCscs}>
                <SelectTrigger><SelectValue placeholder={loadingCscs ? "Loading…" : "Choose staff member"} /></SelectTrigger>
                <SelectContent>
                  {cscs.map((u) => (
                    <SelectItem key={u.user_uuid} value={u.user_uuid} disabled={u.user_uuid === toId}>
                      {displayName(u)}{u.job_title ? <span className="text-muted-foreground"> · {u.job_title}</span> : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="pb-2 text-muted-foreground hidden md:block">
              <ArrowRight className="h-5 w-5" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Reassign to</Label>
              <Select value={toId ?? undefined} onValueChange={(v) => { setToId(v); setResult(null); }} disabled={loadingCscs}>
                <SelectTrigger><SelectValue placeholder={loadingCscs ? "Loading…" : "Choose staff member"} /></SelectTrigger>
                <SelectContent>
                  {cscs.map((u) => (
                    <SelectItem key={u.user_uuid} value={u.user_uuid} disabled={u.user_uuid === fromId}>
                      {displayName(u)}{u.job_title ? <span className="text-muted-foreground"> · {u.job_title}</span> : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {toId ? (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm flex items-center gap-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              {loadingCapacity ? (
                <span className="text-muted-foreground inline-flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading capacity…</span>
              ) : (
                <span>
                  <strong>{displayName(toUser)}</strong> current load:{" "}
                  <span className="font-medium">{toLoad ?? "—"}</span>
                  {" / "}
                  <span className="font-medium">{toCapacity ?? "—"}</span>{" hrs/week"}
                  {toLoad !== null && toCapacity !== null && toLoad >= toCapacity ? (
                    <Badge variant="destructive" className="ml-2">At capacity</Badge>
                  ) : null}
                  {selectedCount > 0 ? (
                    <span className="text-muted-foreground"> — adding {selectedCount} client{selectedCount === 1 ? "" : "s"} on top.</span>
                  ) : null}
                </span>
              )}
            </div>
          ) : null}
        </Card>

        {fromId ? (
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-secondary">
                  {tenants.length} client{tenants.length === 1 ? "" : "s"} currently under {displayName(fromUser)}
                </h2>
                <p className="text-xs text-muted-foreground">Untick any clients you don't want to move.</p>
              </div>
              {tenants.length > 0 ? (
                <div className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedCount === tenants.length}
                    onCheckedChange={(c) => toggleAll(c === true)}
                  />
                  <span className="text-muted-foreground">Select all</span>
                </div>
              ) : null}
            </div>

            {loadingTenants ? (
              <div className="py-10 text-center text-muted-foreground inline-flex items-center gap-2 justify-center w-full">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading clients…
              </div>
            ) : tenants.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">No primary-CSC clients found for this user.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Assigned since</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((t) => (
                    <TableRow key={t.tenant_id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(t.tenant_id)}
                          onCheckedChange={(c) => toggleOne(t.tenant_id, c === true)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{t.tenant_name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {t.assigned_since ? new Date(t.assigned_since).toLocaleDateString("en-AU") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="flex justify-end pt-2">
              <Button
                onClick={handleSubmit}
                disabled={!fromId || !toId || selectedCount === 0 || submitting}
              >
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Reassign {selectedCount} client{selectedCount === 1 ? "" : "s"} from {displayName(fromUser) || "…"} to {displayName(toUser) || "…"}
              </Button>
            </div>
          </Card>
        ) : null}

        {result ? (
          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <h3 className="text-base font-semibold text-secondary">
                Reassigned {result.reassigned.length} client{result.reassigned.length === 1 ? "" : "s"}
              </h3>
            </div>
            {result.skipped.length > 0 ? (
              <Alert variant="default">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{result.skipped.length} skipped</AlertTitle>
                <AlertDescription>
                  <ul className="mt-2 space-y-1 text-sm">
                    {result.skipped.map((s) => (
                      <li key={s.tenant_id}>
                        <span className="font-mono text-xs">#{s.tenant_id}</span> — {s.reason}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Audit rows have been written to <code>client_audit_log</code> with action{" "}
              <code>bulk_csc_reassignment</code>.
            </p>
          </Card>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
