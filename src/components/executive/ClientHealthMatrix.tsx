/**
 * ClientHealthMatrix – Unicorn 2.0
 *
 * Scatter plot: X = Compliance Score, Y = Predictive Operational Risk Score.
 * Each dot = a client + package. Quadrant logic applied.
 * Respects reduced motion (no animation when enabled).
 */

import { useMemo, useState } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, Label } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ExecutiveHealthRow } from '@/hooks/useExecutiveHealth';

interface ClientHealthMatrixProps {
  data: ExecutiveHealthRow[];
  onSelect: (row: ExecutiveHealthRow) => void;
}

const BAND_COLORS: Record<string, string> = {
  stable: 'hsl(275, 55%, 41%)',       // brand-purple
  watch: 'hsl(190, 74%, 50%)',        // brand-aqua
  at_risk: 'hsl(48, 96%, 52%)',       // brand-macaron
  immediate_attention: 'hsl(333, 86%, 51%)', // brand-fuchsia
};

function getQuadrantLabel(complianceScore: number, riskScore: number): string {
  if (complianceScore >= 50 && riskScore < 50) return 'Stable';
  if (complianceScore >= 50 && riskScore >= 50) return 'Stall Risk';
  if (complianceScore < 50 && riskScore < 50) return 'In Progress';
  return 'Immediate Attention';
}

const prefersReducedMotion = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

interface TooltipPayload {
  payload: {
    client_name: string;
    package_name: string;
    overall_score: number;
    operational_risk_score: number;
    risk_band: string;
  };
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-sm max-w-[220px]">
      <p className="font-semibold text-foreground truncate">{d.client_name}</p>
      <p className="text-muted-foreground text-xs truncate">{d.package_name}</p>
      <div className="mt-2 space-y-1">
        <p>Compliance: <span className="font-medium">{d.overall_score}%</span></p>
        <p>Risk Score: <span className="font-medium">{d.operational_risk_score}</span></p>
        <p>Band: <span className="font-medium capitalize">{d.risk_band.replace('_', ' ')}</span></p>
        <p className="text-xs text-muted-foreground mt-1">{getQuadrantLabel(d.overall_score, d.operational_risk_score)}</p>
      </div>
    </div>
  );
}

export function ClientHealthMatrix({ data, onSelect }: ClientHealthMatrixProps) {
  const chartData = useMemo(() =>
    data.map(row => ({
      ...row,
      x: row.overall_score,
      y: row.operational_risk_score,
    })),
    [data]
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Health Matrix</CardTitle>
        <p className="text-xs text-muted-foreground">X: Compliance Score · Y: Operational Risk Score</p>
      </CardHeader>
      <CardContent>
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 10, bottom: 30, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                type="number"
                dataKey="x"
                domain={[0, 100]}
                name="Compliance"
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
              >
                <Label value="Compliance Score" position="bottom" offset={10} className="fill-muted-foreground text-xs" />
              </XAxis>
              <YAxis
                type="number"
                dataKey="y"
                domain={[0, 100]}
                name="Risk"
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
              >
                <Label value="Risk Score" angle={-90} position="insideLeft" offset={0} className="fill-muted-foreground text-xs" />
              </YAxis>
              <ReferenceLine x={50} stroke="hsl(var(--border))" strokeDasharray="4 4" />
              <ReferenceLine y={50} stroke="hsl(var(--border))" strokeDasharray="4 4" />
              <Tooltip content={<CustomTooltip />} />
              <Scatter
                data={chartData}
                isAnimationActive={!prefersReducedMotion}
                onClick={(entry: any) => {
                  if (entry) onSelect(entry);
                }}
                cursor="pointer"
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={BAND_COLORS[entry.risk_band] || BAND_COLORS.stable}
                    r={6}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-3 justify-center">
          {Object.entries(BAND_COLORS).map(([band, color]) => (
            <div key={band} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="capitalize">{band.replace('_', ' ')}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
