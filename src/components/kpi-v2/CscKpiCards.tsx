import { useEffect, useMemo, useState } from "react";
import { KpiGaugeCard } from "./KpiGaugeCard";
import { type KpiV2Period } from "./types";
import { pctStatus, retentionStatus } from "@/lib/kpi-v2/status";
import { KpiDrillDownSheet, type KpiDrillDownKind } from "./KpiDrillDownSheet";
import {
  fetchRetention,
  fetchCommunication,
  fetchCscTasks,
} from "@/lib/kpi-v2/fetchers";

interface Props {
  subjectUuid: string;
  period: KpiV2Period;
}

/**
 * CscKpiCards — three donut-gauge cards for CSC consultants.
 * Data sourced from the kpi_csc_* RPCs via fetchers.ts, which use
 * tenant_csc_assignments (is_primary + point-in-time attribution via
 * assigned_since / superseded_at) as the source of truth.
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
      const [r, c, t] = await Promise.all([
        fetchRetention(subjectUuid, period),
        fetchCommunication(subjectUuid, period),
        fetchCscTasks(subjectUuid, period),
      ]);
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
