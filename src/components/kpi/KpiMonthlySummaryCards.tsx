import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

type Period = "weekly" | "monthly" | "quarterly";

interface Props {
  subjectUuid: string;
  period: Period;
}

const PERIOD_LABEL: Record<Period, string> = {
  weekly: "This week",
  monthly: "This month",
  quarterly: "This quarter",
};

const PERIOD_DAYS: Record<Period, number> = {
  weekly: 7,
  monthly: 30,
  quarterly: 92,
};

type Status = "on" | "risk" | "below" | "none";

const ACCENT: Record<Status, string> = {
  on: "bg-emerald-600",
  risk: "bg-amber-600",
  below: "bg-rose-600",
  none: "bg-muted-foreground/30",
};

function statusBadge(status: Status) {
  if (status === "on")
    return <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 border border-emerald-500/30">On Target</Badge>;
  if (status === "risk")
    return <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 border border-amber-500/30">At Risk</Badge>;
  if (status === "below")
    return <Badge className="bg-rose-500/15 text-rose-700 hover:bg-rose-500/15 border border-rose-500/30">Below Target</Badge>;
  return <Badge variant="secondary">No data</Badge>;
}

function emailStatus(pct: number | null): Status {
  if (pct == null) return "none";
  if (pct >= 80) return "on";
  if (pct >= 72) return "risk";
  return "below";
}

interface CardSpec {
  label: string;
  actual: string;
  target: string;
  status: Status;
}

export function KpiMonthlySummaryCards({ subjectUuid, period }: Props) {
  const [loading, setLoading] = useState(true);
  const [emailPct, setEmailPct] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!subjectUuid) return;
    setLoading(true);
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - PERIOD_DAYS[period]);
      const { data } = await (supabase as any)
        .from("v_kpi_csc_summary")
        .select("email_total,email_sla_met")
        .eq("subject_uuid", subjectUuid)
        .gte("period_start", since.toISOString().slice(0, 10));
      if (cancelled) return;
      const rows = (data ?? []) as Array<{ email_total: number; email_sla_met: number }>;
      const total = rows.reduce((s, r) => s + (r.email_total ?? 0), 0);
      const met = rows.reduce((s, r) => s + (r.email_sla_met ?? 0), 0);
      setEmailPct(total > 0 ? (met / total) * 100 : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [subjectUuid, period]);

  const cards = useMemo<CardSpec[]>(
    () => [
      {
        label: "EMAILS ≤ 12 HRS",
        actual: emailPct == null ? "No data" : `${emailPct.toFixed(0)}%`,
        target: "Target: 80%",
        status: emailStatus(emailPct),
      },
      {
        label: "CLIENT RETENTION",
        actual: "No data",
        target: "Target: 90%",
        status: "none",
      },
      {
        label: "STAGE HEALTH",
        actual: "No data",
        target: "Target: 100% green",
        status: "none",
      },
    ],
    [emailPct],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Monthly summary · {PERIOD_LABEL[period]}
        </h2>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="relative overflow-hidden border shadow-sm">
            <div className={`absolute inset-x-0 top-0 h-1.5 ${ACCENT[c.status]}`} />
            <div className="p-5 pt-6 flex flex-col gap-3 min-h-[140px]">
              <div className="text-[11px] font-semibold tracking-wider text-muted-foreground">
                {c.label}
              </div>
              <div className="text-4xl font-bold leading-none text-foreground">
                {c.actual}
              </div>
              <div className="mt-auto flex items-end justify-between gap-2">
                <span className="text-xs text-muted-foreground">{c.target}</span>
                {statusBadge(c.status)}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

