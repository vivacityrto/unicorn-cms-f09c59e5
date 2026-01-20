import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Compass, Heart, Users, Rocket, Target, Calendar, Sparkles, Shield } from 'lucide-react';
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
              <CardTitle>Mission Control</CardTitle>
              <CardDescription>
                Last updated {new Date(vto.updated_at || vto.created_at).toLocaleDateString()}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Grand Vision (10-Year Target) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Compass className="h-5 w-5 text-primary" />
            <CardTitle>Grand Vision</CardTitle>
          </div>
          <CardDescription>
            Where Vivacity is heading long-term and why the business exists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-foreground whitespace-pre-wrap">
            {vto.ten_year_target || 'Not defined'}
          </p>
        </CardContent>
      </Card>

      {/* Core Values */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-primary" />
            <CardTitle>Core Values</CardTitle>
          </div>
          <CardDescription>
            The behaviours and standards that guide every decision and action.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {Array.isArray(vto.core_values) && vto.core_values.length > 0 ? (
            <ul className="space-y-2">
              {vto.core_values.map((value: string, index: number) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>{value}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">Not defined</p>
          )}
        </CardContent>
      </Card>

      {/* Target Market */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle>Target Market</CardTitle>
          </div>
          <CardDescription>
            The organisations Vivacity is built to serve.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-foreground">{vto.target_market || 'Not defined'}</p>
        </CardContent>
      </Card>

      {/* 3-Year Mission Checkpoint */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            <CardTitle>3-Year Mission Checkpoint</CardTitle>
          </div>
          <CardDescription>
            Where the business must be in three years to stay on mission.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground mb-1">Revenue Target</p>
              <p className="text-xl font-semibold">
                ${vto.three_year_revenue_target?.toLocaleString() || '—'}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground mb-1">Profit Target</p>
              <p className="text-xl font-semibold">
                ${vto.three_year_profit_target?.toLocaleString() || '—'}
              </p>
            </div>
          </div>
          {vto.three_year_measurables && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Measurables</p>
              <p className="text-foreground whitespace-pre-wrap">
                {typeof vto.three_year_measurables === 'string' 
                  ? vto.three_year_measurables 
                  : JSON.stringify(vto.three_year_measurables, null, 2)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 12 Month Mission Objectives */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <CardTitle>12 Month Mission Objectives</CardTitle>
          </div>
          <CardDescription>
            The outcomes that must be achieved in the next 12 months.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground mb-1">Revenue Target</p>
              <p className="text-xl font-semibold">
                ${vto.one_year_revenue_target?.toLocaleString() || '—'}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground mb-1">Profit Target</p>
              <p className="text-xl font-semibold">
                ${vto.one_year_profit_target?.toLocaleString() || '—'}
              </p>
            </div>
          </div>
          {vto.one_year_goals && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Measurables</p>
              <p className="text-foreground whitespace-pre-wrap">
                {typeof vto.one_year_goals === 'string' 
                  ? vto.one_year_goals 
                  : JSON.stringify(vto.one_year_goals, null, 2)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* What Makes Us Different (3 Uniques) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>What Makes Us Different</CardTitle>
          </div>
          <CardDescription>
            The three reasons Vivacity is chosen over alternatives.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {vto.proven_process ? (
            Array.isArray(vto.proven_process) ? (
              <ul className="space-y-2">
                {vto.proven_process.map((item: string, index: number) => (
                  <li key={index} className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-0.5">{index + 1}</Badge>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-foreground whitespace-pre-wrap">{vto.proven_process}</p>
            )
          ) : (
            <p className="text-muted-foreground">Not defined</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
