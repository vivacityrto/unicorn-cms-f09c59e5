import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { KpiGaugeCard } from "./KpiGaugeCard";
import { getPeriodRange, type KpiV2Period } from "./types";
import { pctStatus, retentionStatus } from "@/lib/kpi-v2/status";
import { KpiDrillDownSheet, type KpiDrillDownKind } from "./KpiDrillDownSheet";

interface Props {
  subjectUuid: string;
  period: KpiV2Period;
}

const SLA_SECONDS = 12 * 60 * 60; // 12 hours

/**
 * CscKpiCards — three donut-gauge cards for CSC consultants.
 * Data sourced directly from operational tables (no legacy v_kpi_* views).
 */
export function CscKpiCards({ subjectUuid, period }: Props) {
  const [loading, setLoading] = useState(true);

  // Retention
  const [retentionPct, setRetentionPct] = useState<number | null>(null);
  const [clientsAtStart, setClientsAtStart] = useState(0);
  const [churned, setChurned] = useState(0);

  // Communication
  const [emailPct, setEmailPct] = useState<number | null>(null);
  const [emailTotal, setEmailTotal] = useState(0);
  const [emailMet, setEmailMet] = useState(0);

  // Tasks
  const [tasksPct, setTasksPct] = useState<number | null>(null);
  const [tasksTotal, setTasksTotal] = useState(0);
  const [tasksCompleted, setTasksCompleted] = useState(0);

  const [drill, setDrill] = useState<KpiDrillDownKind | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!subjectUuid) return;
    setLoading(true);

    (async () => {
      const { startIso, endIso } = getPeriodRange(period);
      const startTs = `${startIso}T00:00:00.000Z`;
      const endTs = `${endIso}T23:59:59.999Z`;
      const sb = supabase as any;

      // ---------------- Retention ----------------
      const retentionP = (async () => {
        const { data } = await sb
          .from("tenant_csc_assignments")
          .select("assigned_since, ended_at")
          .eq("csc_user_id", subjectUuid);
        const rows = (data ?? []) as Array<{ assigned_since: string; ended_at: string | null }>;
        const atStart = rows.filter(
          (r) => r.assigned_since < startTs && (r.ended_at == null || r.ended_at >= startTs)
        );
        const churnedRows = atStart.filter(
          (r) => r.ended_at != null && r.ended_at >= startTs && r.ended_at <= endTs
        );
        const total = atStart.length;
        const ch = churnedRows.length;
        const retained = total - ch;
        return {
          total,
          churned: ch,
          pct: total > 0 ? (retained / total) * 100 : null,
        };
      })();

      // ---------------- Communication ----------------
      const commP = (async () => {
        const { data: assignments } = await sb
          .from("tenant_csc_assignments")
          .select("tenant_id")
          .eq("csc_user_id", subjectUuid)
          .eq("is_primary", true)
          .is("ended_at", null);
        const tenantIds = Array.from(
          new Set((assignments ?? []).map((a: any) => a.tenant_id).filter(Boolean))
        );
        if (tenantIds.length === 0) return { total: 0, met: 0, pct: null as number | null };

        // Step 2: fetch client messages in the period, scoped by tenant_id.
        const { data: clientMsgsRaw } = await sb
          .from("tenant_messages")
          .select("id, conversation_id, created_at")
          .in("tenant_id", tenantIds)
          .eq("sender_type", "client")
          .gte("created_at", startTs)
          .lte("created_at", endTs)
          .limit(500);
        const rawMsgs = (clientMsgsRaw ?? []) as Array<{ id: string; conversation_id: string; created_at: string }>;
        if (rawMsgs.length === 0) return { total: 0, met: 0, pct: null };

        // Step 3: extract unique conversation_ids from step 2.
        const uniqueConvIds = Array.from(new Set(rawMsgs.map((m) => m.conversation_id).filter(Boolean)));
        if (uniqueConvIds.length === 0) return { total: 0, met: 0, pct: null };

        // Step 4: fetch messages for those conversations to determine who initiated each.
        const { data: firstMsgs } = await sb
          .from("tenant_messages")
          .select("conversation_id, sender_type, created_at")
          .in("conversation_id", uniqueConvIds)
          .order("created_at", { ascending: true })
          .limit(uniqueConvIds.length * 50);
        const firstByConv = new Map<string, string>();
        (firstMsgs ?? []).forEach((m: any) => {
          if (!firstByConv.has(m.conversation_id)) firstByConv.set(m.conversation_id, m.sender_type);
        });
        const clientInitiatedSet = new Set(
          Array.from(firstByConv.entries())
            .filter(([, sender]) => sender === "client")
            .map(([id]) => id)
        );

        // Step 5: filter step 2's client messages to only client-initiated conversations.
        const cMsgs = rawMsgs.filter((m) => clientInitiatedSet.has(m.conversation_id));
        if (cMsgs.length === 0) return { total: 0, met: 0, pct: null };

        const convIds = Array.from(new Set(cMsgs.map((m) => m.conversation_id).filter(Boolean)));
        const bufferEnd = new Date(new Date(endTs).getTime() + SLA_SECONDS * 1000).toISOString();
        const { data: staffMsgs } = await sb
          .from("tenant_messages")
          .select("conversation_id, created_at")
          .in("conversation_id", convIds)
          .eq("sender_type", "staff")
          .gte("created_at", startTs)
          .lte("created_at", bufferEnd);
        const sByConv = new Map<string, string[]>();
        (staffMsgs ?? []).forEach((s: any) => {
          const arr = sByConv.get(s.conversation_id) ?? [];
          arr.push(s.created_at);
          sByConv.set(s.conversation_id, arr);
        });

        let total = 0;
        let met = 0;
        cMsgs.forEach((m) => {
          const staffTimes = sByConv.get(m.conversation_id) ?? [];
          const clientTs = new Date(m.created_at).getTime();
          const reply = staffTimes
            .map((t) => new Date(t).getTime())
            .filter((t) => t > clientTs)
            .sort((a, b) => a - b)[0];
          if (reply == null) return;
          total += 1;
          if ((reply - clientTs) / 1000 <= SLA_SECONDS) met += 1;
        });
        return { total, met, pct: total > 0 ? (met / total) * 100 : null };
      })();

      // ---------------- CSC Tasks ----------------
      const tasksP = (async () => {
        const { data: aRows } = await sb
          .from("tenant_csc_assignments")
          .select("tenant_id")
          .eq("csc_user_id", subjectUuid)
          .eq("is_primary", true)
          .is("ended_at", null);
        const tenantIds = Array.from(
          new Set((aRows ?? []).map((a: any) => a.tenant_id).filter(Boolean))
        );
        if (tenantIds.length === 0) return { total: 0, completed: 0, pct: null as number | null };
        const { data } = await sb
          .from("client_team_tasks")
          .select(
            "id, status, created_at, client_package_stages!inner(client_packages!inner(tenant_id))"
          )
          .in("client_package_stages.client_packages.tenant_id", tenantIds)
          .gte("created_at", startTs)
          .lte("created_at", endTs);
        const rows = (data ?? []) as Array<{ status: string | null }>;
        const total = rows.length;
        const completed = rows.filter((r) => (r.status ?? "").toLowerCase() === "completed").length;
        return { total, completed, pct: total > 0 ? (completed / total) * 100 : null };
      })();

      const [r, c, t] = await Promise.all([retentionP, commP, tasksP]);
      if (cancelled) return;

      setClientsAtStart(r.total);
      setChurned(r.churned);
      setRetentionPct(r.pct);

      setEmailTotal(c.total);
      setEmailMet(c.met);
      setEmailPct(c.pct);

      setTasksTotal(t.total);
      setTasksCompleted(t.completed);
      setTasksPct(t.pct);

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [subjectUuid, period]);

  const retentionPrimary = retentionPct == null ? "—" : `${retentionPct.toFixed(0)}%`;
  const emailPrimary = emailPct == null ? "—" : `${emailPct.toFixed(0)}%`;
  const tasksPrimary = tasksPct == null ? "—" : `${tasksPct.toFixed(0)}%`;

  const metricText = useMemo(() => {
    if (drill === "retention") {
      return clientsAtStart > 0
        ? `${retentionPrimary} · ${clientsAtStart - churned} of ${clientsAtStart} clients retained (${churned} churned)`
        : "No client assignments in this period.";
    }
    if (drill === "communication") {
      return emailTotal > 0
        ? `${emailPrimary} · ${emailMet} of ${emailTotal} messages replied within 12 hrs`
        : "No client messages recorded for this period.";
    }
    if (drill === "csc_tasks") {
      return tasksTotal > 0
        ? `${tasksPrimary} · ${tasksCompleted} of ${tasksTotal} package tasks completed`
        : "No package tasks recorded for this period.";
    }
    return "";
  }, [drill, retentionPrimary, clientsAtStart, churned, emailPrimary, emailMet, emailTotal, tasksPrimary, tasksCompleted, tasksTotal]);

  const drillLabel: Record<KpiDrillDownKind, string> =
    { retention: "Retention", communication: "Communication", csc_tasks: "Tasks", assistant_tasks: "Tasks" };

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <KpiGaugeCard
          label="Retention"
          description="Clients retained over the selected period."
          value={retentionPct}
          primary={retentionPrimary}
          secondary={clientsAtStart > 0 ? `of ${clientsAtStart}` : undefined}
          target="Target: 100%"
          status={retentionStatus(retentionPct)}
          loading={loading}
          onClick={() => setDrill("retention")}
        />
        <KpiGaugeCard
          label="Communication"
          description="Client emails answered within the 12-hour SLA."
          value={emailPct}
          primary={emailPrimary}
          secondary={emailTotal > 0 ? `of ${emailTotal}` : undefined}
          target="Target: 80%"
          status={pctStatus(emailPct, 80, 72)}
          loading={loading}
          onClick={() => setDrill("communication")}
        />
        <KpiGaugeCard
          label="Tasks"
          description="Assigned tasks completed on or before their due date."
          value={tasksPct}
          primary={tasksPrimary}
          secondary={tasksTotal > 0 ? `of ${tasksTotal}` : undefined}
          target="Target: 90%"
          status={pctStatus(tasksPct, 90, 80)}
          loading={loading}
          onClick={() => setDrill("csc_tasks")}
        />
      </div>

      {drill && (
        <KpiDrillDownSheet
          open={!!drill}
          onOpenChange={(o) => !o && setDrill(null)}
          kind={drill}
          subjectUuid={subjectUuid}
          period={period}
          metricText={metricText}
          label={drillLabel[drill]}
        />
      )}
    </>
  );
}
