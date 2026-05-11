import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PdpCycleSummary } from "@/features/pdp/types";

interface Props {
  summary: PdpCycleSummary | null | undefined;
}

export function CurrencySplitChart({ summary }: Props) {
  const data = [
    { kind: "VET currency", hours: Number(summary?.vet_currency_hours ?? 0) },
    { kind: "Industry currency", hours: Number(summary?.industry_currency_hours ?? 0) },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Currency split</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="kind" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="hours" fill="#7130A0" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
