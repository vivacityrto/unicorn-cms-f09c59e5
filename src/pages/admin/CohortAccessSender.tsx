import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUserAccess } from "@/hooks/useUserAccess";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertTriangle, Send, ChevronRight, Search } from "lucide-react";
import { format } from "date-fns";
import type { Json } from "@/integrations/supabase/types";

type Action = "activate" | "reset";
type AccountState = "ghost" | "invited" | "active" | "dormant" | "disabled";

interface ResolvedRow {
  user_uuid: string;
  email: string;
  tenant_id: number | null;
  tenant_name: string | null;
  account_state: AccountState;
  unicorn_role: string | null;
  last_sign_in_at: string | null;
  truncated: boolean;
}

interface CohortFilter {
  account_state?: AccountState[];
  tenant_ids?: number[];
  complyhub_tier?: string[];
  last_sign_in?: { mode: string; before?: string };
  user_created?: { mode: string; before?: string };
}

interface JobRow {
  id: string;
  action: Action;
  status: string;
  total_resolved: number;
  total_planned: number;
  total_sent: number;
  total_skipped: number;
  total_failed: number;
  created_at: string;
  notes: string | null;
}

const STATE_OPTIONS: { value: AccountState; label: string }[] = [
  { value: "ghost", label: "Ghost (no auth account)" },
  { value: "invited", label: "Invited / never logged in" },
  { value: "active", label: "Active (signed in within 90 days)" },
  { value: "dormant", label: "Dormant (no sign-in for 90+ days)" },
  { value: "disabled", label: "Disabled" },
];

const TIER_OPTIONS = ["Diamond", "Founder", "Starter"];

export default function CohortAccessSender() {
  const navigate = useNavigate();
  const { isVivacityStaff, isLoading: accessLoading } = useUserAccess();

  // Filter state
  const [action, setAction] = useState<Action>("reset");
  const [states, setStates] = useState<AccountState[]>(["invited"]);
  const [tiers, setTiers] = useState<string[]>([]);
  const [tenantQuery, setTenantQuery] = useState("");
  const [tenantIds, setTenantIds] = useState<number[]>([]);
  const [lsiMode, setLsiMode] = useState<string>("__none__");
  const [lsiBefore, setLsiBefore] = useState("");
  const [ucMode, setUcMode] = useState<string>("__none__");
  const [ucBefore, setUcBefore] = useState("");
  const [cap, setCap] = useState(1000);
  const [throttle, setThrottle] = useState(400);
  const [batchSize, setBatchSize] = useState(10);
  const [notes, setNotes] = useState("");

  // Tenants for picker
  const [tenants, setTenants] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    supabase.from("tenants").select("id, name").order("name").limit(1000).then(({ data }) => {
      setTenants(data || []);
    });
  }, []);

  // Preview
  const [preview, setPreview] = useState<ResolvedRow[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [launching, setLaunching] = useState(false);
  const [selectedPreviewUuids, setSelectedPreviewUuids] = useState<Set<string>>(new Set());

  // Reset confirmation whenever the recipient selection changes
  useEffect(() => { setConfirmText(""); }, [selectedPreviewUuids]);

  // Jobs list
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const refreshJobs = async () => {
    const { data } = await supabase
      .from("cohort_send_jobs")
      .select("id, action, status, total_resolved, total_planned, total_sent, total_skipped, total_failed, created_at, notes")
      .order("created_at", { ascending: false })
      .limit(50);
    setJobs((data || []) as unknown as JobRow[]);
  };
  useEffect(() => { refreshJobs(); }, []);

  const filterJson = useMemo(() => {
    const f: CohortFilter = {};
    if (states.length) f.account_state = states;
    if (tenantIds.length) f.tenant_ids = tenantIds;
    if (tiers.length) f.complyhub_tier = tiers;
    if (lsiMode !== "__none__") {
      f.last_sign_in = { mode: lsiMode };
      if (lsiMode === "before" && lsiBefore) f.last_sign_in.before = lsiBefore;
    }
    if (ucMode !== "__none__") {
      f.user_created = { mode: ucMode };
      if (ucMode === "before" && ucBefore) f.user_created.before = ucBefore;
    }
    return f;
  }, [states, tenantIds, tiers, lsiMode, lsiBefore, ucMode, ucBefore]);

  const toggleState = (s: AccountState) => {
    setStates((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
    setPreview(null); setConfirmText("");
  };
  const toggleTier = (t: string) => {
    setTiers((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
    setPreview(null); setConfirmText("");
  };
  const toggleTenant = (id: number) => {
    setTenantIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    setPreview(null); setConfirmText("");
  };

  const filteredTenants = useMemo(() => {
    const q = tenantQuery.trim().toLowerCase();
    if (!q) return tenants.slice(0, 50);
    return tenants.filter((t) => t.name?.toLowerCase().includes(q)).slice(0, 50);
  }, [tenants, tenantQuery]);

  const runPreview = async () => {
    setPreviewLoading(true); setPreview(null); setConfirmText(""); setSelectedPreviewUuids(new Set());
    try {
      const { data, error } = await supabase.rpc("resolve_cohort", { p_filter: filterJson as unknown as Json, p_cap: cap });
      if (error) throw error;
      const rows = (data || []) as ResolvedRow[];
      setPreview(rows);
      setSelectedPreviewUuids(new Set(rows.map((r) => r.user_uuid)));
    } catch (e) {
      toast({ title: "Preview failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  };

  const previewSummary = useMemo(() => {
    if (!preview) return null;
    const counts = { activate: 0, reset: 0, skip_disabled: 0, skip_state_mismatch: 0 };
    for (const r of preview) {
      if (!selectedPreviewUuids.has(r.user_uuid)) continue;
      if (r.account_state === "disabled") counts.skip_disabled++;
      else if (r.account_state === "ghost") {
        if (action === "activate") counts.activate++; else counts.skip_state_mismatch++;
      } else {
        if (action === "reset") counts.reset++; else counts.skip_state_mismatch++;
      }
    }
    const will_send = action === "activate" ? counts.activate : counts.reset;
    const will_skip = counts.skip_disabled + counts.skip_state_mismatch;
    return { ...counts, will_send, will_skip, total: preview.length, truncated: preview[0]?.truncated || false };
  }, [preview, action, selectedPreviewUuids]);

  const expectedConfirm = previewSummary ? `SEND TO ${previewSummary.will_send} PEOPLE` : "";

  const launch = async () => {
    if (!previewSummary) return;
    if (confirmText.trim() !== expectedConfirm) {
      toast({ title: "Confirmation mismatch", description: `Type exactly: ${expectedConfirm}`, variant: "destructive" });
      return;
    }
    setLaunching(true);
    try {
      const totalResolved = preview?.length ?? 0;
      const selectionDiffers = selectedPreviewUuids.size !== totalResolved;
      const { data, error } = await supabase.rpc("launch_cohort_job", {
        p_action: action,
        p_filter: filterJson as unknown as Json,
        p_cap: cap,
        p_batch_size: batchSize,
        p_throttle_ms: throttle,
        p_notes: notes || null,
        p_include_uuids: selectionDiffers ? Array.from(selectedPreviewUuids) : null,
      });
      if (error) throw error;
      const jobId = data as string;
      toast({ title: "Job launched", description: `Cohort job ${jobId.slice(0, 8)} created` });
      navigate(`/admin/cohort-sender/jobs/${jobId}`);
    } catch (e) {
      toast({ title: "Launch failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setLaunching(false);
    }
  };

  if (accessLoading) return <div className="p-8 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  if (!isVivacityStaff) return <div className="p-8">Vivacity staff only.</div>;

  return (
      <div className="container mx-auto p-6 space-y-6 max-w-6xl">
        <div>
          <h1 className="text-2xl font-semibold">Cohort Access Sender</h1>
          <p className="text-sm text-muted-foreground">
            Cross-tenant Activate / Send-password-reset across filtered cohorts. Vivacity staff only.
          </p>
        </div>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>This sends real emails</AlertTitle>
          <AlertDescription>
            Each job reuses the existing single-user senders. State-aware routing applies: ghost → Activate, invited / active / dormant → Reset, disabled → skipped.
            Sending runs while this tab is open — closing the page pauses the drain. Reopen the job to resume.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader><CardTitle>1. Action</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Select value={action} onValueChange={(v) => { setAction(v as Action); setPreview(null); setConfirmText(""); }}>
              <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="reset">Send password reset</SelectItem>
                <SelectItem value="activate">Activate (ghost users only)</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>2. Filters</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="text-sm font-medium">Account state</Label>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                {STATE_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={states.includes(opt.value)} onCheckedChange={() => toggleState(opt.value)} />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm">Last sign-in</Label>
                <Select value={lsiMode} onValueChange={(v) => { setLsiMode(v); setPreview(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No filter</SelectItem>
                    <SelectItem value="never">Never signed in</SelectItem>
                    <SelectItem value="before">Before date…</SelectItem>
                  </SelectContent>
                </Select>
                {lsiMode === "before" && (
                  <Input type="date" className="mt-2" value={lsiBefore} onChange={(e) => { setLsiBefore(e.target.value); setPreview(null); }} />
                )}
              </div>
              <div>
                <Label className="text-sm">Auth user created</Label>
                <Select value={ucMode} onValueChange={(v) => { setUcMode(v); setPreview(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No filter</SelectItem>
                    <SelectItem value="before">Before date…</SelectItem>
                  </SelectContent>
                </Select>
                {ucMode === "before" && (
                  <Input type="date" className="mt-2" value={ucBefore} onChange={(e) => { setUcBefore(e.target.value); setPreview(null); }} />
                )}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Tenants</Label>
              <div className="mt-2 flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search tenants…" value={tenantQuery} onChange={(e) => setTenantQuery(e.target.value)} />
                {tenantIds.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => { setTenantIds([]); setPreview(null); }}>
                    Clear ({tenantIds.length})
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Leave empty to include all tenants.</p>
              <div className="mt-2 max-h-48 overflow-auto rounded border p-2 grid grid-cols-1 md:grid-cols-2 gap-1">
                {filteredTenants.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={tenantIds.includes(t.id)} onCheckedChange={() => toggleTenant(t.id)} />
                    <span className="truncate">{t.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">ComplyHub tier (optional)</Label>
              <Alert variant="default" className="mt-2">
                <AlertDescription className="text-xs">
                  Tier is recorded for only 18 tenants. Filtering by tier will exclude every tenant without a recorded tier.
                </AlertDescription>
              </Alert>
              <div className="mt-2 flex gap-3">
                {TIER_OPTIONS.map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={tiers.includes(t)} onCheckedChange={() => toggleTier(t)} /> {t}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-sm">Cap (max recipients)</Label>
                <Input type="number" min={1} max={1000} value={cap} onChange={(e) => { setCap(Math.min(1000, Math.max(1, Number(e.target.value) || 1))); setPreview(null); }} />
              </div>
              <div>
                <Label className="text-sm">Throttle (ms between sends)</Label>
                <Input type="number" min={0} max={5000} value={throttle} onChange={(e) => setThrottle(Math.min(5000, Math.max(0, Number(e.target.value) || 0)))} />
              </div>
              <div>
                <Label className="text-sm">Batch size</Label>
                <Input type="number" min={1} max={50} value={batchSize} onChange={(e) => setBatchSize(Math.min(50, Math.max(1, Number(e.target.value) || 1)))} />
              </div>
            </div>

            <div>
              <Label className="text-sm">Notes (optional, recorded on job)</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>3. Preview</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={runPreview} disabled={previewLoading}>
              {previewLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Resolving…</> : "Preview recipients"}
            </Button>

            {previewSummary && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge variant="default">{previewSummary.will_send} will {action}</Badge>
                  <Badge variant="secondary">{previewSummary.will_skip} skipped</Badge>
                  <span className="text-muted-foreground">
                    (disabled {previewSummary.skip_disabled}; state-mismatch {previewSummary.skip_state_mismatch})
                  </span>
                  {previewSummary.truncated && (
                    <Badge variant="destructive">Truncated to cap of {cap}</Badge>
                  )}
                </div>

                <div className="max-h-72 overflow-auto rounded border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={preview!.length > 0 && selectedPreviewUuids.size === preview!.length}
                            onCheckedChange={(checked) => {
                              if (checked) setSelectedPreviewUuids(new Set(preview!.map((r) => r.user_uuid)));
                              else setSelectedPreviewUuids(new Set());
                            }}
                            aria-label="Select all recipients"
                          />
                        </TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Tenant</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Last sign-in</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview!.slice(0, 25).map((r) => (
                        <TableRow key={r.user_uuid}>
                          <TableCell>
                            <Checkbox
                              checked={selectedPreviewUuids.has(r.user_uuid)}
                              onCheckedChange={(checked) => {
                                setSelectedPreviewUuids((prev) => {
                                  const next = new Set(prev);
                                  if (checked) next.add(r.user_uuid);
                                  else next.delete(r.user_uuid);
                                  return next;
                                });
                              }}
                              aria-label={`Select ${r.email}`}
                            />
                          </TableCell>
                          <TableCell className="text-xs">{r.email}</TableCell>
                          <TableCell className="text-xs">{r.tenant_name ?? r.tenant_id ?? "—"}</TableCell>
                          <TableCell><Badge variant="outline">{r.account_state}</Badge></TableCell>
                          <TableCell className="text-xs">{r.last_sign_in_at ? format(new Date(r.last_sign_in_at), "dd/MM/yyyy") : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {preview!.length > 25 && (
                    <p className="text-xs text-muted-foreground p-2">
                      Showing first 25 of {preview!.length}. Select All applies to all {preview!.length} rows.
                    </p>
                  )}
                </div>

                <div className="space-y-2 pt-2">
                  <p className="text-xs text-muted-foreground">
                    {selectedPreviewUuids.size} of {preview!.length} recipients selected.
                  </p>
                  {selectedPreviewUuids.size === 0 && (
                    <Alert variant="destructive">
                      <AlertDescription>No recipients selected.</AlertDescription>
                    </Alert>
                  )}
                  <Label className="text-sm">Type to confirm: <code className="font-mono">{expectedConfirm}</code></Label>
                  <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={expectedConfirm} />
                  <Button onClick={launch} disabled={launching || confirmText.trim() !== expectedConfirm || previewSummary.will_send === 0 || selectedPreviewUuids.size === 0}>
                    {launching ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Launching…</> : <><Send className="h-4 w-4 mr-2" />Launch job</>}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent jobs</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Skipped</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Planned</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="text-xs">{format(new Date(j.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                    <TableCell><Badge variant="outline">{j.action}</Badge></TableCell>
                    <TableCell><Badge variant={j.status === "completed" ? "default" : j.status === "running" ? "secondary" : "outline"}>{j.status}</Badge></TableCell>
                    <TableCell>{j.total_sent}</TableCell>
                    <TableCell>{j.total_skipped}</TableCell>
                    <TableCell>{j.total_failed}</TableCell>
                    <TableCell>{j.total_planned}</TableCell>
                    <TableCell>
                      <Link to={`/admin/cohort-sender/jobs/${j.id}`} className="text-primary text-sm inline-flex items-center">
                        Open <ChevronRight className="h-3 w-3 ml-1" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {jobs.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">No jobs yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
  );
}
