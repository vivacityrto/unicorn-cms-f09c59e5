import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PdpEvidenceItem } from "@/features/pdp/types";

interface Props {
  evidence: PdpEvidenceItem[];
}

const TYPE_LABELS: Record<string, string> = {
  academy_completion: "Academy",
  academy_certificate: "Academy cert",
  external_course: "External course",
  workshop: "Workshop",
  industry_placement: "Industry placement",
  validation_activity: "Validation",
  community_of_practice: "CoP",
  conference: "Conference",
  mentoring: "Mentoring",
  reading: "Reading",
  audit_response: "Audit response",
  other: "Other",
};

export function EvidenceByTypeChart({ evidence }: Props) {
  const buckets = new Map<string, { type: string; formal: number; informal: number }>();
  for (const e of evidence) {
    const key = e.evidence_type ?? "other";
    if (!buckets.has(key)) {
      buckets.set(key, { type: TYPE_LABELS[key] ?? key, formal: 0, informal: 0 });
    }
    const hours = (e.duration_minutes ?? 0) / 60;
    const row = buckets.get(key)!;
    if (e.is_formal) row.formal += hours;
    else row.informal += hours;
  }
  const data = Array.from(buckets.values()).map((r) => ({
    ...r,
    formal: Number(r.formal.toFixed(2)),
    informal: Number(r.informal.toFixed(2)),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Hours by evidence type</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No evidence logged yet.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="type" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="formal" stackId="a" fill="#23C0DD" name="Formal" />
                <Bar dataKey="informal" stackId="a" fill="#ED1878" name="Informal" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
