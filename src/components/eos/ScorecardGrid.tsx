import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { EosScorecardMetric } from '@/types/eos';

interface ScorecardGridProps {
  metrics: EosScorecardMetric[];
}

export function ScorecardGrid({ metrics }: ScorecardGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {metrics.map((metric) => (
        <Card key={metric.id}>
          <CardHeader>
            <CardTitle className="text-base">{metric.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {metric.description && (
                <p className="text-sm text-muted-foreground">{metric.description}</p>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Target:</span>
                <span className="font-semibold">
                  {metric.target_value} {metric.unit}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Frequency:</span>
                <span className="text-sm">{metric.frequency}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
