import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { useKpiAccess } from "@/hooks/useKpiAccess";
import { useKpiReview, type OverallStatus, type PeriodType } from "@/hooks/useKpiReview";
import type { KpiRole } from "@/hooks/useKpiSummary";

interface Props {
  subjectUuid: string;
  role: KpiRole;
}

const STATUS_LABEL: Record<OverallStatus, string> = {
  exceeds: "Exceeds",
  on_track: "On Track",
  at_risk: "At Risk",
  off_track: "Off Track",
};

const STATUS_VARIANT: Record<OverallStatus, "default" | "secondary" | "destructive" | "outline"> = {
  exceeds: "default",
  on_track: "default",
  at_risk: "secondary",
  off_track: "destructive",
};

function defaultPeriod(periodType: PeriodType): { start: string; end: string } {
  const now = new Date();
  let start: Date;
  let end: Date;
  if (periodType === "monthly") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (periodType === "quarterly") {
    const q = Math.floor(now.getMonth() / 3);
    start = new Date(now.getFullYear(), q * 3, 1);
    end = new Date(now.getFullYear(), q * 3 + 3, 0);
  } else {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear(), 11, 31);
  }
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try { return format(parseISO(iso), "dd/MM/yyyy HH:mm"); } catch { return iso; }
}

function StatusPill({ status }: { status: OverallStatus | null }) {
  if (!status) return <Badge variant="outline">Insufficient data</Badge>;
  return <Badge variant={STATUS_VARIANT[status]} className="capitalize">{STATUS_LABEL[status]}</Badge>;
}

export function KpiReviewPanel({ subjectUuid, role }: Props) {
  const { isSuperAdmin } = useKpiAccess();
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [{ start, end }, setRange] = useState(defaultPeriod("monthly"));
  const [notes, setNotes] = useState("");
  const [signoffComment, setSignoffComment] = useState("");

  useEffect(() => {
    setRange(defaultPeriod(periodType));
  }, [periodType]);

  const { review, signoffs, previewStatus, previewMetrics, loading, busy, save, signOff, lock } = useKpiReview({
    subjectUuid,
    role,
    periodType,
    periodStart: start,
    periodEnd: end,
  });

  useEffect(() => {
    setNotes(review?.notes ?? "");
  }, [review?.id, review?.notes]);

  const locked = !!review?.locked_at;
  const computedStatus: OverallStatus | null = review?.overall_status ?? previewStatus;
  const metrics = (review?.metrics as Record<string, unknown>) ?? previewMetrics;

  const metricEntries = useMemo(
    () => Object.entries(metrics).filter(([, v]) => v !== null && v !== undefined),
    [metrics]
  );

  const handleSave = async () => {
    try {
      await save(notes);
      toast.success(review ? "Review updated" : "Review created");
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    }
  };

  const handleSignOff = async (type: string) => {
    try {
      await signOff(type, signoffComment);
      setSignoffComment("");
      toast.success("Sign-off recorded");
    } catch (e: any) {
      toast.error(e?.message ?? "Sign-off failed");
    }
  };

  const handleLock = async () => {
    if (!confirm("Lock this review? Notes and metrics cannot be changed after locking.")) return;
    try { await lock(); toast.success("Review locked"); }
    catch (e: any) { toast.error(e?.message ?? "Lock failed"); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          KPI review
          {locked && <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Locked</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Period selector */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Period type</Label>
            <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)} disabled={locked}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Period start</Label>
            <Input type="date" value={start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} disabled={locked} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Period end</Label>
            <Input type="date" value={end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} disabled={locked} />
          </div>
        </div>

        {/* Auto-computed status */}
        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm">
              <span className="font-medium">Overall status</span>
              <span className="text-muted-foreground"> · auto-computed from KPI metrics</span>
            </div>
            {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <StatusPill status={computedStatus} />}
          </div>
          {metricEntries.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {metricEntries.map(([k, v]) => (
                <div key={k} className="rounded bg-background px-2 py-1.5 border">
                  <div className="text-muted-foreground">{k}</div>
                  <div className="font-mono">{String(v)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <Label className="text-xs text-muted-foreground">Reviewer notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Context, follow-ups, coaching points…"
            rows={4}
            disabled={locked}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={busy || locked || !subjectUuid}>
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {review ? "Update review" : "Create review"}
          </Button>
          {review && !locked && (
            <Button variant="outline" onClick={handleLock} disabled={busy}>
              <Lock className="h-4 w-4 mr-1" /> Lock review
            </Button>
          )}
          {review && (
            <span className="text-xs text-muted-foreground ml-auto">
              Last updated {fmtDate(review.updated_at)}
            </span>
          )}
        </div>

        <Separator />

        {/* Sign-offs */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" /> Sign-offs ({signoffs.length})
            </h3>
          </div>
          {signoffs.length === 0 && (
            <p className="text-xs text-muted-foreground">No sign-offs yet.</p>
          )}
          {signoffs.map((s) => (
            <div key={s.id} className="rounded border p-2 text-xs space-y-0.5">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">{s.signoff_type}</Badge>
                <span className="text-muted-foreground">{fmtDate(s.signed_at)}</span>
              </div>
              {s.comment && <div>{s.comment}</div>}
            </div>
          ))}
          {review && (
            <div className="space-y-2">
              <Textarea
                value={signoffComment}
                onChange={(e) => setSignoffComment(e.target.value)}
                placeholder="Optional sign-off comment"
                rows={2}
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => handleSignOff("reviewer")}>
                  Sign off as reviewer
                </Button>
                {isSuperAdmin && (
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => handleSignOff("superadmin")}>
                    Sign off as SuperAdmin
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
