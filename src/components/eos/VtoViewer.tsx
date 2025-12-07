import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { EosVtoVersion } from '@/types/eos';

interface VtoViewerProps {
  vto: EosVtoVersion;
}

export function VtoViewer({ vto }: VtoViewerProps) {
  return (
    <div className="space-y-6">
      {/* Version Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>V/TO</CardTitle>
              <CardDescription>
                Last updated {new Date(vto.updated_at || vto.created_at).toLocaleDateString()}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Core Values */}
      <Card>
        <CardHeader>
          <CardTitle>Core Values</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {Array.isArray(vto.core_values) && vto.core_values.map((value: string, index: number) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-primary font-bold">•</span>
                <span>{value}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Target Market */}
      <Card>
        <CardHeader>
          <CardTitle>Target Market</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{vto.target_market || 'Not defined'}</p>
        </CardContent>
      </Card>

      {/* 10-Year Target */}
      <Card>
        <CardHeader>
          <CardTitle>10-Year Target</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground whitespace-pre-wrap">
            {vto.ten_year_target || 'Not defined'}
          </p>
        </CardContent>
      </Card>

      {/* 3-Year Revenue Target */}
      <Card>
        <CardHeader>
          <CardTitle>3-Year Revenue Target</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            ${vto.three_year_revenue_target?.toLocaleString() || 'Not defined'}
          </p>
        </CardContent>
      </Card>

      {/* 1-Year Revenue Target */}
      <Card>
        <CardHeader>
          <CardTitle>1-Year Revenue Target</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            ${vto.one_year_revenue_target?.toLocaleString() || 'Not defined'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
