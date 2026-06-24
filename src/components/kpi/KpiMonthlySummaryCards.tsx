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

function statusBadge(status: Status) {
  if (status === "on")
    return <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 border-emerald-500/30">On Target</Badge>;
  if (status === "risk")
    return <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 border-amber-500/30">At Risk</Badge>;
  if (status === "below")
    return <Badge className="bg-rose-500/15 text-rose-700 hover:bg-rose-500/15 border-rose-500/30">Below Target</Badge>;
  return <Badge variant="secondary">No data</Badge>;
}

function emailStatus(pct: number | null): Status {
  if (pct == null) return "none";
  if (pct >= 80) return "on";
  if (pct >= 72) return "risk";
  return "below";
}

interface CardSpec {
  name: string;
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
        name: "Emails ≤ 12 hrs",
        actual: emailPct == null ? "No data" : `${emailPct.toFixed(0)}%`,
        target: "Target 80%",
        status: emailStatus(emailPct),
      },
      {
        name: "Client retention",
        actual: "No data",
        target: "Target 90%",
        status: "none",
      },
      {
        name: "Stage health",
        actual: "No data",
        target: "Target 100% green",
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {cards.map((c) => (
          <Card key={c.name} className="p-4 flex items-center justify-between gap-3 rounded-full">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wide text-muted-foreground truncate">
                {c.name}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-semibold">{c.actual}</span>
                <span className="text-xs text-muted-foreground">{c.target}</span>
              </div>
            </div>
            {statusBadge(c.status)}
          </Card>
        ))}
      </div>
    </div>
  );
}
