/**
 * ClientHealthMatrix – Unicorn 2.0
 *
 * Scatter plot with delta mode toggle.
 * Low/None confidence points rendered with reduced emphasis in delta mode.
 */

import { useMemo, useState } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, Label } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ExecutiveHealthRow } from '@/hooks/useExecutiveHealth';

interface ClientHealthMatrixProps {
  data: ExecutiveHealthRow[];
  onSelect: (row: ExecutiveHealthRow) => void;
}

const BAND_COLORS: Record<string, string> = {
  stable: 'hsl(275, 55%, 41%)',
  watch: 'hsl(190, 74%, 50%)',
  at_risk: 'hsl(48, 96%, 52%)',
  immediate_attention: 'hsl(333, 86%, 51%)',
};

const prefersReducedMotion = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

function CustomTooltip({ active, payload, deltaMode }: { active?: boolean; payload?: any[]; deltaMode?: boolean }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const confidenceLabel = deltaMode
    ? (d.delta_confidence_compliance_7d === 'none' || d.delta_confidence_compliance_7d === 'low'
        ? ' (Low confidence delta)'
        : '')
    : '';
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-sm max-w-[220px]">
      <p className="font-semibold text-foreground truncate">{d.client_name}</p>
      <p className="text-muted-foreground text-xs truncate">{d.package_name}</p>
      <div className="mt-2 space-y-1">
        {deltaMode ? (
          <>
            <p>Compliance Δ7d: <span className="font-medium">{d.delta_overall_score_7d > 0 ? '+' : ''}{d.delta_overall_score_7d}</span></p>
            <p>Risk Δ7d: <span className="font-medium">{d.delta_operational_risk_7d > 0 ? '+' : ''}{d.delta_operational_risk_7d}</span></p>
            {confidenceLabel && <p className="text-xs text-muted-foreground italic">{confidenceLabel.trim()}</p>}
          </>
        ) : (
          <>
            <p>Compliance: <span className="font-medium">{d.overall_score}%</span></p>
            <p>Risk Score: <span className="font-medium">{d.operational_risk_score}</span></p>
          </>
        )}
        <p>Band: <span className="font-medium capitalize">{d.risk_band.replace('_', ' ')}</span></p>
      </div>
    </div>
  );
}

export function ClientHealthMatrix({ data, onSelect }: ClientHealthMatrixProps) {
  const [deltaMode, setDeltaMode] = useState(false);

  const chartData = useMemo(() =>
    data.map(row => ({
      ...row,
      x: deltaMode ? row.delta_overall_score_7d : row.overall_score,
      y: deltaMode ? row.delta_operational_risk_7d : row.operational_risk_score,
    })),
    [data, deltaMode]
  );

  const domain: [number, number] = deltaMode ? [-50, 50] : [0, 100];
  const refLine = deltaMode ? 0 : 50;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Health Matrix</CardTitle>
          <p className="text-xs text-muted-foreground">
            {deltaMode ? 'X: Compliance Δ7d · Y: Risk Δ7d' : 'X: Compliance Score · Y: Risk Score'}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            variant={deltaMode ? 'ghost' : 'secondary'}
            size="sm"
            className="text-xs h-7"
            onClick={() => setDeltaMode(false)}
          >
            Current
          </Button>
          <Button
            variant={deltaMode ? 'secondary' : 'ghost'}
            size="sm"
            className="text-xs h-7"
            onClick={() => setDeltaMode(true)}
          >
            Change (7d)
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 10, bottom: 30, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" dataKey="x" domain={domain} tick={{ fontSize: 11 }} className="fill-muted-foreground">
                <Label value={deltaMode ? 'Compliance Δ' : 'Compliance Score'} position="bottom" offset={10} className="fill-muted-foreground text-xs" />
              </XAxis>
              <YAxis type="number" dataKey="y" domain={domain} tick={{ fontSize: 11 }} className="fill-muted-foreground">
                <Label value={deltaMode ? 'Risk Δ' : 'Risk Score'} angle={-90} position="insideLeft" offset={0} className="fill-muted-foreground text-xs" />
              </YAxis>
              <ReferenceLine x={refLine} stroke="hsl(var(--border))" strokeDasharray="4 4" />
              <ReferenceLine y={refLine} stroke="hsl(var(--border))" strokeDasharray="4 4" />
              <Tooltip content={<CustomTooltip deltaMode={deltaMode} />} />
              <Scatter
                data={chartData}
                isAnimationActive={!prefersReducedMotion}
                onClick={(entry: any) => entry && onSelect(entry)}
                cursor="pointer"
              >
                {chartData.map((entry, index) => {
                  const isLowConfidence = deltaMode && (
                    entry.delta_confidence_compliance_7d === 'low' ||
                    entry.delta_confidence_compliance_7d === 'none'
                  );
                  const baseColor = BAND_COLORS[entry.risk_band] || BAND_COLORS.stable;
                  return (
                    <Cell
                      key={`cell-${index}`}
                      fill={baseColor}
                      fillOpacity={isLowConfidence ? 0.3 : 1}
                      r={isLowConfidence ? 4 : 6}
                    />
                  );
                })}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
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
