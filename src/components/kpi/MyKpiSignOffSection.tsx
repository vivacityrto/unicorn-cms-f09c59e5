import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ShieldCheck, Lock, Circle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

type OverallStatus = "exceeds" | "on_track" | "at_risk" | "off_track";

interface SignoffRow {
  id: number;
  signoff_type: string;
  reviewer_user_id: string;
  signed_at: string;
  comment: string | null;
  reviewer_name?: string;
  reviewer_role?: string;
}

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
  signoffs: SignoffRow[];
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

const ROLE_LABEL: Record<string, string> = {
  csc_consultant: "CSC Consultant",
  cst_assistant: "CST Assistant",
  developer: "Developer",
};

const EXPECTED_SIGNOFFS = ["subject", "reviewer", "manager"];

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return format(parseISO(iso), "dd/MM/yyyy"); } catch { return iso; }
}
function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return format(parseISO(iso), "dd/MM/yyyy HH:mm"); } catch { return iso; }
}
const EMAIL_TYPE_LABEL: Record<string, string> = {
  general_email: "General email",
  client_message: "Client message",
};
function fmtEmailType(t: string | null | undefined) {
  if (!t) return "—";
  return EMAIL_TYPE_LABEL[t] ?? t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function fmtMinutes(m: number | null | undefined) {
  if (m == null) return "—";
  const mins = Math.max(0, Math.round(Number(m)));
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  if (h === 0) return `${r}m`;
  return `${h}h ${r}m`;
}
function fmtSubject(s: string | null | undefined) {
  if (!s) return "—";
  return s.length > 50 ? s.slice(0, 50) + "…" : s;
}

function periodHeader(r: ReviewRow) {
  const start = parseISO(r.period_start);
  let label = "";
  if (r.period_type === "monthly") label = format(start, "MMMM yyyy");
  else if (r.period_type === "quarterly") label = `Q${Math.floor(start.getMonth() / 3) + 1} ${format(start, "yyyy")}`;
  else if (r.period_type === "annual") label = format(start, "yyyy");
  else label = `${fmtDate(r.period_start)} – ${fmtDate(r.period_end)}`;
  const periodTitle = r.period_type.charAt(0).toUpperCase() + r.period_type.slice(1);
  return `${label} · ${periodTitle} · ${ROLE_LABEL[r.kpi_role] ?? r.kpi_role}`;
}

function trafficColor(pct: number | null, target: number) {
  if (pct == null) return "bg-muted text-muted-foreground";
  if (pct >= target) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
  if (pct >= target - 8) return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "bg-red-500/15 text-red-700 dark:text-red-400";
}

function TrafficLight({ pct, target, label }: { pct: number | null; target: number; label: string }) {
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${trafficColor(pct, target)}`}>
      <Circle className="h-2 w-2 fill-current" />
      {label}: {pct == null ? "—" : `${pct.toFixed(1)}%`} (target ≥{target}%)
    </div>
  );
}

// ---------- Role-specific detail panels ----------

function CscDetail({ uuid, start, end }: { uuid: string; start: string; end: string }) {
  const [summary, setSummary] = useState<{ email_total: number; email_sla_met: number; email_sla_pct: number | null } | null>(null);
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: sumRows }, { data: log }] = await Promise.all([
        (supabase as any)
          .from("v_kpi_csc_summary")
          .select("email_total, email_sla_met")
          .eq("subject_uuid", uuid)
          .gte("period_start", start)
          .lte("period_start", end),
        (supabase as any)
          .from("kpi_email_log")
          .select("id, received_at, responded_at, response_minutes, sla_met, email_type, subject")
          .eq("user_uuid", uuid)
          .gte("received_at", start)
          .lte("received_at", `${end}T23:59:59`)
          .order("received_at", { ascending: false })
          .limit(10),
      ]);
      const total = (sumRows ?? []).reduce((a: number, r: any) => a + Number(r.email_total ?? 0), 0);
      const met = (sumRows ?? []).reduce((a: number, r: any) => a + Number(r.email_sla_met ?? 0), 0);
      setSummary({
        email_total: total,
        email_sla_met: met,
        email_sla_pct: total > 0 ? (met / total) * 100 : null,
      });
      setEmails(log ?? []);
      setLoading(false);
    })();
  }, [uuid, start, end]);

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  const s = summary!;

  return (
    <div className="space-y-4">
      <section>
        <h4 className="text-sm font-semibold mb-2">Email SLA</h4>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>Received: <strong>{s.email_total}</strong></span>
          <span>Replied ≤12h: <strong>{s.email_sla_met}</strong></span>
          <TrafficLight pct={s.email_sla_pct} target={80} label="SLA" />
        </div>
        {emails.length > 0 ? (
          <div className="mt-2 rounded border max-h-[240px] overflow-y-auto overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-2 py-1">Received</th>
                  <th className="px-2 py-1">Subject</th>
                  <th className="px-2 py-1">Responded</th>
                  <th className="px-2 py-1">Duration</th>
                  <th className="px-2 py-1">Type</th>
                  <th className="px-2 py-1">SLA</th>
                </tr>
              </thead>
              <tbody>
                {emails.map((e: any) => (
                  <tr key={e.id} className="border-t">
                    <td className="px-2 py-1">{fmtDateTime(e.received_at)}</td>
                    <td className="px-2 py-1" title={e.subject ?? ""}>{fmtSubject(e.subject)}</td>
                    <td className="px-2 py-1">{fmtDateTime(e.responded_at)}</td>
                    <td className="px-2 py-1">{fmtMinutes(e.response_minutes)}</td>
                    <td className="px-2 py-1">{fmtEmailType(e.email_type)}</td>
                    <td className="px-2 py-1">
                      <Badge variant={e.sla_met ? "default" : "destructive"}>
                        {e.sla_met == null ? "—" : e.sla_met ? "Met" : "Missed"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground mt-1">No email log entries for this period.</p>
        )}
      </section>

      <section>
        <h4 className="text-sm font-semibold mb-1">Client retention</h4>
        <p className="text-xs text-muted-foreground">No data (no tenant assignments).</p>
      </section>
      <section>
        <h4 className="text-sm font-semibold mb-1">Stage health</h4>
        <p className="text-xs text-muted-foreground">No data (no tenant assignments).</p>
      </section>
    </div>
  );
}

function CstDetail({ uuid, start, end }: { uuid: string; start: string; end: string }) {
  const [summary, setSummary] = useState<any>(null);
  const [emails, setEmails] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [assignedByNames, setAssignedByNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: sumRows }, { data: log }, { data: tk }] = await Promise.all([
        (supabase as any)
          .from("v_kpi_cst_summary")
          .select("sla1_total, sla1_met, sla2_total, sla2_met, tasks_total, tasks_completed, tasks_on_time")
          .eq("subject_uuid", uuid)
          .gte("period_start", start)
          .lte("period_start", end),
        (supabase as any)
          .from("kpi_email_log")
          .select("id, received_at, responded_at, response_minutes, sla_met, email_type, subject")
          .eq("user_uuid", uuid)
          .gte("received_at", start)
          .lte("received_at", `${end}T23:59:59`)
          .order("received_at", { ascending: false })
          .limit(10),
        (supabase as any)
          .from("kpi_tasks")
          .select("id, title, due_at, status, assigned_by, completed_at, created_at")
          .eq("assignee_uuid", uuid)
          .gte("created_at", start)
          .lte("created_at", `${end}T23:59:59`)
          .order("due_at", { ascending: true }),
      ]);

      const sum = (sumRows ?? []).reduce(
        (acc: any, r: any) => {
          acc.sla1_total += Number(r.sla1_total ?? 0);
          acc.sla1_met += Number(r.sla1_met ?? 0);
          acc.sla2_total += Number(r.sla2_total ?? 0);
          acc.sla2_met += Number(r.sla2_met ?? 0);
          acc.tasks_total += Number(r.tasks_total ?? 0);
          acc.tasks_on_time += Number(r.tasks_on_time ?? 0);
          return acc;
        },
        { sla1_total: 0, sla1_met: 0, sla2_total: 0, sla2_met: 0, tasks_total: 0, tasks_on_time: 0 }
      );
      setSummary(sum);
      setEmails(log ?? []);
      setTasks(tk ?? []);

      const ids = Array.from(new Set((tk ?? []).map((t: any) => t.assigned_by).filter(Boolean)));
      if (ids.length) {
        const { data: us } = await (supabase as any)
          .from("users")
          .select("user_uuid, first_name, last_name")
          .in("user_uuid", ids);
        const map: Record<string, string> = {};
        (us ?? []).forEach((u: any) => {
          map[u.user_uuid] = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "—";
        });
        setAssignedByNames(map);
      }
      setLoading(false);
    })();
  }, [uuid, start, end]);

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  const s = summary;
  const sla1Pct = s.sla1_total > 0 ? (s.sla1_met / s.sla1_total) * 100 : null;
  const sla2Pct = s.sla2_total > 0 ? (s.sla2_met / s.sla2_total) * 100 : null;
  const tasksPct = s.tasks_total > 0 ? (s.tasks_on_time / s.tasks_total) * 100 : null;

  const taskBadge = (status: string) => {
    const map: Record<string, { label: string; v: any }> = {
      done_on_time: { label: "Done on time", v: "default" },
      rectified: { label: "Rectified", v: "secondary" },
      delayed: { label: "Delayed", v: "destructive" },
      pending: { label: "Pending", v: "outline" },
    };
    const m = map[status] ?? { label: status, v: "outline" };
    return <Badge variant={m.v}>{m.label}</Badge>;
  };

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">SLA 1 — Emails</h4>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>Total: <strong>{s.sla1_total}</strong></span>
          <span>Met: <strong>{s.sla1_met}</strong></span>
          <TrafficLight pct={sla1Pct} target={90} label="SLA 1" />
        </div>
      </section>
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">SLA 2 — Client messages</h4>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>Total: <strong>{s.sla2_total}</strong></span>
          <span>Met: <strong>{s.sla2_met}</strong></span>
          <TrafficLight pct={sla2Pct} target={90} label="SLA 2" />
        </div>
        {emails.length > 0 && (
          <div className="rounded border max-h-[240px] overflow-y-auto overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-2 py-1">Received</th>
                  <th className="px-2 py-1">Subject</th>
                  <th className="px-2 py-1">Responded</th>
                  <th className="px-2 py-1">Duration</th>
                  <th className="px-2 py-1">Type</th>
                  <th className="px-2 py-1">SLA</th>
                </tr>
              </thead>
              <tbody>
                {emails.map((e: any) => (
                  <tr key={e.id} className="border-t">
                    <td className="px-2 py-1">{fmtDateTime(e.received_at)}</td>
                    <td className="px-2 py-1" title={e.subject ?? ""}>{fmtSubject(e.subject)}</td>
                    <td className="px-2 py-1">{fmtDateTime(e.responded_at)}</td>
                    <td className="px-2 py-1">{fmtMinutes(e.response_minutes)}</td>
                    <td className="px-2 py-1">{fmtEmailType(e.email_type)}</td>
                    <td className="px-2 py-1">
                      <Badge variant={e.sla_met ? "default" : "destructive"}>
                        {e.sla_met == null ? "—" : e.sla_met ? "Met" : "Missed"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Tasks before deadline</h4>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>Total: <strong>{s.tasks_total}</strong></span>
          <span>On time: <strong>{s.tasks_on_time}</strong></span>
          <TrafficLight pct={tasksPct} target={80} label="Tasks" />
        </div>
        {tasks.length > 0 ? (
          <div className="rounded border overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-2 py-1">Title</th>
                  <th className="px-2 py-1">Due</th>
                  <th className="px-2 py-1">Status</th>
                  <th className="px-2 py-1">Assigned by</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t: any) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-2 py-1">{t.title}</td>
                    <td className="px-2 py-1">{fmtDateTime(t.due_at)}</td>
                    <td className="px-2 py-1">{taskBadge(t.status)}</td>
                    <td className="px-2 py-1">{assignedByNames[t.assigned_by] ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No tasks in this period.</p>
        )}
      </section>
    </div>
  );
}

function DevDetail({ uuid, start, end }: { uuid: string; start: string; end: string }) {
  const [summary, setSummary] = useState<any>(null);
  const [rocks, setRocks] = useState<any[]>([]);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const startD = parseISO(start);
      const qYear = startD.getFullYear();
      const qNum = Math.floor(startD.getMonth() / 3) + 1;
      const [{ data: sumRows }, { data: rk }, { data: ms }] = await Promise.all([
        (supabase as any)
          .from("v_kpi_dev_summary")
          .select("tickets_opened, tickets_resolved, reopen_count, avg_first_response_minutes")
          .eq("subject_uuid", uuid)
          .gte("period_start", start)
          .lte("period_start", end),
        (supabase as any)
          .from("eos_rocks")
          .select("id, title, status, quarter_year, quarter_number")
          .eq("owner_id", uuid)
          .eq("quarter_year", qYear)
          .eq("quarter_number", qNum),
        (supabase as any)
          .from("kpi_dev_milestones")
          .select("id, title, planned_date, delivered_date")
          .eq("owner_uuid", uuid)
          .gte("planned_date", start)
          .lte("planned_date", end)
          .order("planned_date", { ascending: true }),
      ]);

      const sum = (sumRows ?? []).reduce(
        (acc: any, r: any) => {
          acc.tickets_opened += Number(r.tickets_opened ?? 0);
          acc.tickets_resolved += Number(r.tickets_resolved ?? 0);
          acc.reopen_count += Number(r.reopen_count ?? 0);
          if (r.avg_first_response_minutes != null) {
            acc._frSum += Number(r.avg_first_response_minutes);
            acc._frN += 1;
          }
          return acc;
        },
        { tickets_opened: 0, tickets_resolved: 0, reopen_count: 0, _frSum: 0, _frN: 0 }
      );
      sum.avg_first_response_minutes = sum._frN ? sum._frSum / sum._frN : null;
      setSummary(sum);
      setRocks(rk ?? []);
      setMilestones(ms ?? []);
      setLoading(false);
    })();
  }, [uuid, start, end]);

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  const s = summary;

  return (
    <div className="space-y-4">
      <section>
        <h4 className="text-sm font-semibold mb-2">Tickets</h4>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>Opened: <strong>{s.tickets_opened}</strong></span>
          <span>Resolved: <strong>{s.tickets_resolved}</strong></span>
          <span>Reopens: <strong>{s.reopen_count}</strong></span>
          <span>Avg 1st response: <strong>{s.avg_first_response_minutes != null ? `${s.avg_first_response_minutes.toFixed(1)} min` : "—"}</strong></span>
        </div>
      </section>

      <section>
        <h4 className="text-sm font-semibold mb-2">Rocks this quarter</h4>
        {rocks.length > 0 ? (
          <ul className="text-sm space-y-1">
            {rocks.map((r: any) => (
              <li key={r.id} className="flex items-center justify-between border rounded px-2 py-1">
                <span>{r.title}</span>
                <Badge variant="outline">{r.status ?? "—"}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No rocks for this quarter.</p>
        )}
      </section>

      <section>
        <h4 className="text-sm font-semibold mb-2">Milestones</h4>
        {milestones.length > 0 ? (
          <div className="rounded border overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-2 py-1">Project</th>
                  <th className="px-2 py-1">Planned</th>
                  <th className="px-2 py-1">Delivered</th>
                  <th className="px-2 py-1">On time</th>
                </tr>
              </thead>
              <tbody>
                {milestones.map((m: any) => {
                  const onTime = m.delivered_date && m.planned_date && m.delivered_date <= m.planned_date;
                  return (
                    <tr key={m.id} className="border-t">
                      <td className="px-2 py-1">{m.title}</td>
                      <td className="px-2 py-1">{fmtDate(m.planned_date)}</td>
                      <td className="px-2 py-1">{fmtDate(m.delivered_date)}</td>
                      <td className="px-2 py-1">
                        {m.delivered_date ? (
                          <Badge variant={onTime ? "default" : "destructive"}>{onTime ? "Yes" : "No"}</Badge>
                        ) : (
                          <Badge variant="outline">Pending</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No milestones in this period.</p>
        )}
      </section>
    </div>
  );
}

// ---------- Main component ----------

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
    const signoffsByReview: Record<number, SignoffRow[]> = {};
    if (ids.length) {
      const { data: so } = await (supabase as any)
        .from("kpi_review_signoffs")
        .select("id, review_id, signoff_type, reviewer_user_id, signed_at, comment")
        .in("review_id", ids);
      const uuids = Array.from(new Set((so ?? []).map((s: any) => s.reviewer_user_id)));
      const nameMap: Record<string, { name: string; role: string }> = {};
      if (uuids.length) {
        const { data: us } = await (supabase as any)
          .from("users")
          .select("user_uuid, first_name, last_name, kpi_role")
          .in("user_uuid", uuids);
        (us ?? []).forEach((u: any) => {
          nameMap[u.user_uuid] = {
            name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "—",
            role: u.kpi_role ?? "",
          };
        });
      }
      (so ?? []).forEach((s: any) => {
        (signoffsByReview[s.review_id] ??= []).push({
          ...s,
          reviewer_name: nameMap[s.reviewer_user_id]?.name,
          reviewer_role: nameMap[s.reviewer_user_id]?.role,
        });
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
        <CardHeader><CardTitle className="text-base">My KPI reviews</CardTitle></CardHeader>
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
      <CardContent className="space-y-4">
        {rows.map((r) => {
          const alreadySigned = r.signoffs.some(
            (s) => s.reviewer_user_id === user?.id && s.signoff_type === "subject"
          );
          const allSigned = EXPECTED_SIGNOFFS.every((t) =>
            r.signoffs.some((s) => s.signoff_type === t)
          );
          const showButton = !alreadySigned && !allSigned;

          return (
            <div key={r.id} className="rounded-lg border bg-card">
              <div className="flex flex-wrap items-center gap-2 border-b p-3">
                <span className="text-sm font-semibold">{periodHeader(r)}</span>
                {r.overall_status && (
                  <Badge variant={STATUS_VARIANT[r.overall_status]} className="capitalize">
                    {STATUS_LABEL[r.overall_status]}
                  </Badge>
                )}
                {r.locked_at && (
                  <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Locked</Badge>
                )}
                {alreadySigned && (
                  <Badge variant="default" className="ml-auto">You signed</Badge>
                )}
              </div>

              <div className="p-3 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold mb-2">KPI breakdown</h3>
                    {r.kpi_role === "csc_consultant" && (
                      <CscDetail uuid={user!.id} start={r.period_start} end={r.period_end} />
                    )}
                    {r.kpi_role === "cst_assistant" && (
                      <CstDetail uuid={user!.id} start={r.period_start} end={r.period_end} />
                    )}
                    {r.kpi_role === "developer" && (
                      <DevDetail uuid={user!.id} start={r.period_start} end={r.period_end} />
                    )}
                  </div>

                  {r.notes && (
                    <div>
                      <h3 className="text-sm font-semibold mb-1">Reviewer notes</h3>
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground rounded border bg-muted/30 p-2">
                        {r.notes}
                      </p>
                    </div>
                  )}

                  {r.signoffs.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-1">Signatures</h3>
                      <ul className="text-xs space-y-1">
                        {r.signoffs.map((s) => (
                          <li key={s.id} className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="capitalize">{s.signoff_type}</Badge>
                            <span className="font-medium">{s.reviewer_name ?? s.reviewer_user_id}</span>
                            {s.reviewer_role && <span className="text-muted-foreground">({s.reviewer_role})</span>}
                            <span className="text-muted-foreground">· {fmtDateTime(s.signed_at)}</span>
                            {s.comment && <span className="text-muted-foreground italic">— {s.comment}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {showButton && (
                    <div className="space-y-2 border-t pt-3">
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

            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
