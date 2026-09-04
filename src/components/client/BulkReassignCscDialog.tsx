import { useEffect, useMemo, useState } from "react";
import { Loader2, Users, AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

export interface BulkReassignTenant {
  id: number;
  name: string;
}

interface CscUser {
  user_uuid: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  job_title: string | null;
}

interface ReassignResult {
  reassigned: number[];
  skipped: { tenant_id: number; reason: string }[];
}

const displayName = (u: CscUser | undefined | null) =>
  u ? ([u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || "Unnamed") : "";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fromUserId: string;
  fromUserName: string;
  tenants: BulkReassignTenant[];
  onSuccess: (result: ReassignResult) => void;
}

export function BulkReassignCscDialog({ open, onOpenChange, fromUserId, fromUserName, tenants, onSuccess }: Props) {
  const [cscs, setCscs] = useState<CscUser[]>([]);
  const [loadingCscs, setLoadingCscs] = useState(true);
  const [toId, setToId] = useState<string | null>(null);
  const [toLoad, setToLoad] = useState<number | null>(null);
  const [toCapacity, setToCapacity] = useState<number | null>(null);
  const [loadingCapacity, setLoadingCapacity] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ReassignResult | null>(null);

  // Reset internal state whenever the dialog opens fresh
  useEffect(() => {
    if (open) {
      setToId(null);
      setResult(null);
    }
  }, [open]);

  // Load active CSCs (excluding QA pod)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingCscs(true);
      const { data, error } = await supabase
        .from("users")
        .select("user_uuid, first_name, last_name, email, job_title")
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
  }, [open]);

  // Capacity for "to"
  useEffect(() => {
    if (!toId) {
      setToLoad(null); setToCapacity(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingCapacity(true);
      const [loadRes, capRes] = await Promise.all([
        supabase.rpc("compute_consultant_current_load", { p_user_uuid: toId }),
        supabase.rpc("compute_consultant_weekly_capacity", { p_user_uuid: toId }),
      ]);
      if (cancelled) return;
      setToLoad(typeof loadRes.data === "number" ? loadRes.data : null);
      setToCapacity(typeof capRes.data === "number" ? capRes.data : null);
      setLoadingCapacity(false);
    })();
    return () => { cancelled = true; };
  }, [toId]);

  const toUser = useMemo(() => cscs.find(u => u.user_uuid === toId) ?? null, [cscs, toId]);
  const selectableCscs = useMemo(() => cscs.filter(u => u.user_uuid !== fromUserId), [cscs, fromUserId]);

  const handleSubmit = async () => {
    if (!toId || tenants.length === 0) return;
    setSubmitting(true);
    setResult(null);
    const { data, error } = await supabase.functions.invoke("bulk-reassign-team-member", {
      body: {
        from_user_id: fromUserId,
        to_user_id: toId,
        tenant_ids: tenants.map(t => t.id),
        role_scope: "primary_csc",
      },
    });
    setSubmitting(false);
    if (error) {
      toast.error("Reassignment failed", { description: error.message });
      return;
    }
    const r = (data as ReassignResult) ?? { reassigned: [], skipped: [] };
    setResult(r);
    toast.success(
      `Reassigned ${r.reassigned.length} client${r.reassigned.length === 1 ? "" : "s"} to ${displayName(toUser)}`,
      { description: r.skipped.length ? `${r.skipped.length} skipped — see details.` : undefined }
    );
    onSuccess(r);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reassign {tenants.length} client{tenants.length === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>
            Move primary CSC ownership from <strong>{fromUserName}</strong> to a different team member.
            This updates both the relationship record and the live capacity column atomically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* To picker */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">From</Label>
              <div className="h-10 rounded-md border bg-muted/40 px-3 flex items-center text-sm">
                {fromUserName}
              </div>
            </div>
            <div className="pb-3 text-muted-foreground hidden md:block">
              <ArrowRight className="h-5 w-5" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Reassign to</Label>
              <Select value={toId ?? undefined} onValueChange={(v) => { setToId(v); setResult(null); }} disabled={loadingCscs || submitting}>
                <SelectTrigger><SelectValue placeholder={loadingCscs ? "Loading…" : "Choose team member"} /></SelectTrigger>
                <SelectContent>
                  {selectableCscs.map(u => (
                    <SelectItem key={u.user_uuid} value={u.user_uuid}>
                      {displayName(u)}{u.job_title ? <span className="text-muted-foreground"> · {u.job_title}</span> : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Capacity */}
          {toId ? (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              {loadingCapacity ? (
                <span className="text-muted-foreground inline-flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading capacity…
                </span>
              ) : (
                <span>
                  <strong>{displayName(toUser)}</strong> current load:{" "}
                  <span className="font-medium">{toLoad ?? "—"}</span>{" / "}
                  <span className="font-medium">{toCapacity ?? "—"}</span> hrs/week
                  {toLoad !== null && toCapacity !== null && toLoad >= toCapacity && (
                    <Badge variant="destructive" className="ml-2">At capacity</Badge>
                  )}
                  <span className="text-muted-foreground"> — adding {tenants.length} client{tenants.length === 1 ? "" : "s"} on top.</span>
                </span>
              )}
            </div>
          ) : null}

          {/* Tenant review */}
          <div>
            <Label className="text-xs text-muted-foreground">Clients being moved</Label>
            <ScrollArea className="mt-1 max-h-48 rounded-md border">
              <ul className="divide-y text-sm">
                {tenants.map(t => (
                  <li key={t.id} className="px-3 py-1.5">{t.name}</li>
                ))}
              </ul>
            </ScrollArea>
          </div>

          {/* Result */}
          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-medium">
                  Reassigned {result.reassigned.length} client{result.reassigned.length === 1 ? "" : "s"}.
                </span>
              </div>
              {result.skipped.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{result.skipped.length} skipped</AlertTitle>
                  <AlertDescription>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {result.skipped.map(s => {
                        const t = tenants.find(x => x.id === s.tenant_id);
                        return (
                          <li key={s.tenant_id}>
                            <span className="font-medium">{t?.name ?? `#${s.tenant_id}`}</span> — {s.reason}
                          </li>
                        );
                      })}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button onClick={handleSubmit} disabled={!toId || submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reassign {tenants.length} client{tenants.length === 1 ? "" : "s"}
              {toUser ? ` to ${displayName(toUser)}` : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
