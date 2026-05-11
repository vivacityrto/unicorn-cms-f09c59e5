import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RadialBar, RadialBarChart, ResponsiveContainer, PolarAngleAxis } from "recharts";
import { Clock, Target, MessageSquare } from "lucide-react";
import { CurrencyStatusPill } from "./CurrencyStatusPill";
import type { PdpCycleSummary, PdpUserCurrency } from "@/features/pdp/types";

interface Props {
  summary: PdpCycleSummary | null | undefined;
  currency: PdpUserCurrency | null | undefined;
  isLoading: boolean;
}

export function PdpProgressCard({ summary, currency, isLoading }: Props) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  const percent = Math.max(0, Math.min(100, Number(summary?.percent_complete ?? 0)));
  const hours = Number(summary?.actual_pd_hours ?? 0);
  const target = Number(summary?.target_pd_hours ?? 0);
  const goalsMet = Number(summary?.goals_met ?? 0);
  const goalsTotal = Number(summary?.goals_total ?? 0);
  const reflections = Number(summary?.reflection_count ?? 0);

  const data = [{ name: "complete", value: percent, fill: "#7130A0" }];

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row gap-6 items-center md:items-stretch">
          {/* Dial */}
          <div className="relative w-48 h-48 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                innerRadius="75%"
                outerRadius="100%"
                data={data}
                startAngle={90}
                endAngle={-270}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar dataKey="value" cornerRadius={12} background={{ fill: "#F1E8F8" }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-[var(--viv-purple)]">{Math.round(percent)}%</span>
              <span className="text-xs text-muted-foreground mt-1">complete</span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 md:grid-cols-1 gap-3 content-center">
            <Stat
              icon={<Clock className="h-4 w-4" />}
              label="Hours logged"
              value={`${hours.toFixed(1)}${target ? ` / ${target}` : ""}`}
            />
            <Stat
              icon={<Target className="h-4 w-4" />}
              label="Goals met"
              value={`${goalsMet} / ${goalsTotal}`}
            />
            <Stat
              icon={<MessageSquare className="h-4 w-4" />}
              label="Reflections"
              value={reflections.toString()}
            />
          </div>

          {/* Currency */}
          <div className="flex md:flex-col items-center md:items-end gap-2 md:justify-center md:border-l md:pl-6">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">
              Currency
            </span>
            <CurrencyStatusPill status={currency?.currency_status} />
            {typeof currency?.days_until_cycle_end === "number" && (
              <span className="text-xs text-muted-foreground">
                {currency.days_until_cycle_end} days remaining
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}
