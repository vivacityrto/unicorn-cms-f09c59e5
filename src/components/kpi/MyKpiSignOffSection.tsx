import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ShieldCheck, Lock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

type OverallStatus = "exceeds" | "on_track" | "at_risk" | "off_track";

interface ReviewRow {
  id: number;
  kpi_role: string;
  period_type: string;
  period_start: string;
  period_end: string;
  overall_status: OverallStatus | null;
  notes: string | null;
  locked_at: string | null;
  updated_at: string;
  signoffs: { signoff_type: string; reviewer_user_id: string }[];
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

function fmt(iso: string | null) {
  if (!iso) return "—";
  try { return format(parseISO(iso), "dd/MM/yyyy"); } catch { return iso; }
}

export function MyKpiSignOffSection() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [comments, setComments] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data: reviews } = await (supabase as any)
      .from("kpi_reviews")
      .select("id, kpi_role, period_type, period_start, period_end, overall_status, notes, locked_at, updated_at")
      .eq("subject_uuid", user.id)
      .order("period_start", { ascending: false });

    const ids = (reviews ?? []).map((r: any) => r.id);
    let signoffsByReview: Record<number, { signoff_type: string; reviewer_user_id: string }[]> = {};
    if (ids.length) {
      const { data: so } = await (supabase as any)
        .from("kpi_review_signoffs")
        .select("review_id, signoff_type, reviewer_user_id")
        .in("review_id", ids);
      (so ?? []).forEach((s: any) => {
        (signoffsByReview[s.review_id] ??= []).push(s);
      });
    }
    setRows(
      (reviews ?? []).map((r: any) => ({ ...r, signoffs: signoffsByReview[r.id] ?? [] }))
    );
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const handleSignOff = async (reviewId: number) => {
    if (!user?.id) return;
    setBusyId(reviewId);
    const { error } = await (supabase as any).from("kpi_review_signoffs").insert({
      review_id: reviewId,
      reviewer_user_id: user.id,
      signoff_type: "subject",
      comment: comments[reviewId] || null,
    });
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Sign-off recorded");
    setComments((c) => ({ ...c, [reviewId]: "" }));
    load();
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Reviews awaiting your sign-off</CardTitle></CardHeader>
        <CardContent><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">My KPI reviews</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">No reviews have been created yet.</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> My KPI reviews
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((r) => {
          const alreadySigned = r.signoffs.some(
            (s) => s.reviewer_user_id === user?.id && s.signoff_type === "subject"
          );
          return (
            <div key={r.id} className="rounded border p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="uppercase">{r.kpi_role}</Badge>
                <span className="text-sm font-medium">
                  {r.period_type} · {fmt(r.period_start)} – {fmt(r.period_end)}
                </span>
                {r.overall_status && (
                  <Badge variant={STATUS_VARIANT[r.overall_status]} className="capitalize">
                    {STATUS_LABEL[r.overall_status]}
                  </Badge>
                )}
                {r.locked_at && (
                  <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Locked</Badge>
                )}
                {alreadySigned ? (
                  <Badge variant="default" className="ml-auto">Signed</Badge>
                ) : (
                  <Badge variant="secondary" className="ml-auto">Awaiting your sign-off</Badge>
                )}
              </div>
              {r.notes && (
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{r.notes}</p>
              )}
              {!alreadySigned && (
                <div className="space-y-2">
                  <Textarea
                    rows={2}
                    placeholder="Optional comment for the reviewer"
                    value={comments[r.id] ?? ""}
                    onChange={(e) => setComments((c) => ({ ...c, [r.id]: e.target.value }))}
                  />
                  <Button size="sm" disabled={busyId === r.id} onClick={() => handleSignOff(r.id)}>
                    {busyId === r.id && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Sign off
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
