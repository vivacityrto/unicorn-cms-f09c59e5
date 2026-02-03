import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  ChevronDown,
  AlertCircle,
  AlertTriangle,
  Info,
  Calendar,
  Target,
  MessageSquare,
  Users,
  BarChart3,
  ArrowRight,
  Loader2,
  CheckCircle,
  ExternalLink,
} from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEosHealth } from '@/hooks/useEosHealth';
import { useFacilitatorMode } from '@/contexts/FacilitatorModeContext';
import { useEosAlerts } from '@/hooks/useEosAlerts';
import { AlertsList } from '@/components/eos/alerts';
import { 
  HEALTH_BAND_COLORS, 
  HEALTH_BAND_LABELS,
  type TrendDirection,
  type HealthDimension,
  type DimensionScore,
} from '@/types/eosHealth';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const TREND_ICONS: Record<TrendDirection, typeof TrendingUp> = {
  improving: TrendingUp,
  stable: Minus,
  declining: TrendingDown,
};

const TREND_LABELS: Record<TrendDirection, string> = {
  improving: 'Improving',
  stable: 'Stable',
  declining: 'Declining',
};

const DIMENSION_ICONS: Record<HealthDimension, typeof Calendar> = {
  cadence: Calendar,
  rocks: Target,
  ids: AlertCircle,
  people: Users,
  quarterly: BarChart3,
};

const SEVERITY_ICONS = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_COLORS = {
  critical: 'text-destructive',
  warning: 'text-amber-600 dark:text-amber-400',
  info: 'text-muted-foreground',
};

export default function EosHealth() {
  return (
    <DashboardLayout>
      <HealthContent />
    </DashboardLayout>
  );
}

function HealthContent() {
  const { health, isLoading } = useEosHealth();
  const { isFacilitatorMode } = useFacilitatorMode();
  const [expandedDimensions, setExpandedDimensions] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'health' | 'alerts'>('health');

  const toggleDimension = (dimension: string) => {
    setExpandedDimensions(prev => 
      prev.includes(dimension)
        ? prev.filter(d => d !== dimension)
        : [...prev, dimension]
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!health) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Unable to load health data.</p>
      </div>
    );
  }

  const colors = HEALTH_BAND_COLORS[health.overallBand];
  const TrendIcon = TREND_ICONS[health.trend];

  // Find lowest dimension for facilitator guidance
  const lowestDimension = [...health.dimensions].sort((a, b) => a.score - b.score)[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="EOS Health & Alerts"
        description="Real-time health metrics and proactive interventions"
      />
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="health">Health Score</TabsTrigger>
          <TabsTrigger value="alerts">Stuck Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="space-y-6 mt-6">
          {/* Overall Score Card */}
          <Card className={cn('border-2', colors.border)}>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            {/* Score Display */}
            <div className="flex items-center gap-6">
              <div className={cn('p-4 rounded-2xl', colors.bg)}>
                <Activity className={cn('h-10 w-10', colors.text)} />
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className={cn('text-5xl font-bold', colors.text)}>
                    {health.overallScore}
                  </span>
                  <span className="text-2xl text-muted-foreground">/100</span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <Badge 
                    variant="outline" 
                    className={cn('text-sm font-medium', colors.bg, colors.text, colors.border)}
                  >
                    {HEALTH_BAND_LABELS[health.overallBand]}
                  </Badge>
                  <div className={cn(
                    'flex items-center gap-1 text-sm',
                    health.trend === 'improving' ? 'text-emerald-600 dark:text-emerald-400' :
                    health.trend === 'declining' ? 'text-destructive' : 'text-muted-foreground'
                  )}>
                    <TrendIcon className="h-4 w-4" />
                    <span>{TREND_LABELS[health.trend]}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Progress and Legend */}
            <div className="flex-1 min-w-[250px]">
              <Progress value={health.overallScore} className="h-4 mb-4" />
              <div className="flex justify-between text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-destructive/50" />
                  <span className="text-muted-foreground">At Risk (0-39)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-amber-500/50" />
                  <span className="text-muted-foreground">Attention (40-69)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-emerald-500/50" />
                  <span className="text-muted-foreground">Healthy (70-84)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-primary/50" />
                  <span className="text-muted-foreground">Strong (85+)</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Facilitator Guidance */}
      {isFacilitatorMode && lowestDimension.score < 70 && lowestDimension.issues.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-primary">Next Best Action</p>
                <p className="text-sm text-muted-foreground mt-1">
                  <strong>{lowestDimension.label}</strong> is scoring lowest at {lowestDimension.score}%.
                  {' '}{lowestDimension.issues[0]?.message}
                </p>
              </div>
              {lowestDimension.issues[0]?.link && (
                <Link to={lowestDimension.issues[0].link}>
                  <Button size="sm" variant="outline">
                    Fix Now
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dimension Cards */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Health Dimensions</h2>
        {health.dimensions.map((dimension) => (
          <DimensionCard
            key={dimension.dimension}
            dimension={dimension}
            isExpanded={expandedDimensions.includes(dimension.dimension)}
            onToggle={() => toggleDimension(dimension.dimension)}
          />
        ))}
      </div>

      {/* Strong Score Celebration */}
      {health.overallScore >= 85 && (
        <Card className="border-primary bg-gradient-to-br from-primary/5 to-primary/10">
          <CardContent className="py-8 text-center">
            <CheckCircle className="h-12 w-12 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-bold text-primary mb-2">
              Strong EOS Execution! 🎉
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Your organization is running EOS with discipline. Keep up the great work
              and maintain your rhythm.
            </p>
          </CardContent>
        </Card>
      )}
        </TabsContent>

        <TabsContent value="alerts" className="mt-6">
          <AlertsList />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface DimensionCardProps {
  dimension: DimensionScore;
  isExpanded: boolean;
  onToggle: () => void;
}

function DimensionCard({ dimension, isExpanded, onToggle }: DimensionCardProps) {
  const Icon = DIMENSION_ICONS[dimension.dimension];
  const colors = HEALTH_BAND_COLORS[dimension.band];

  return (
    <Card className={cn(
      'transition-all',
      dimension.score >= 85 && 'border-primary/30 bg-primary/5'
    )}>
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
            <div className="flex items-center gap-4">
              {/* Icon */}
              <div className={cn('p-2 rounded-lg', colors.bg)}>
                <Icon className={cn('h-5 w-5', colors.text)} />
              </div>

              {/* Title and Description */}
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base flex items-center gap-2">
                  {dimension.label}
                  {dimension.score >= 85 && (
                    <CheckCircle className="h-4 w-4 text-primary" />
                  )}
                </CardTitle>
                <CardDescription className="text-sm">
                  {dimension.description}
                </CardDescription>
              </div>

              {/* Score */}
              <div className="text-right mr-4">
                <div className={cn('text-2xl font-bold', colors.text)}>
                  {dimension.score}
                </div>
                <Badge 
                  variant="outline" 
                  className={cn('text-xs', colors.bg, colors.text, colors.border)}
                >
                  {HEALTH_BAND_LABELS[dimension.band]}
                </Badge>
              </div>

              {/* Expand Icon */}
              <ChevronDown className={cn(
                'h-5 w-5 text-muted-foreground transition-transform',
                isExpanded && 'rotate-180'
              )} />
            </div>

            {/* Progress Bar */}
            <Progress value={dimension.score} className="h-1.5 mt-3" />
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 space-y-4">
            {/* Signals */}
            <div className="pl-12">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Key Signals
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {dimension.signals.map((signal, idx) => (
                  <div 
                    key={idx}
                    className={cn(
                      'p-2 rounded-md border',
                      signal.isPositive 
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800' 
                        : 'bg-muted/50 border-muted'
                    )}
                  >
                    <div className={cn(
                      'text-lg font-semibold',
                      signal.isPositive ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'
                    )}>
                      {signal.value}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {signal.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Issues */}
            {dimension.issues.length > 0 && (
              <div className="pl-12">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Issues Affecting Score
                </p>
                <div className="space-y-2">
                  {dimension.issues.map((issue) => {
                    const SeverityIcon = SEVERITY_ICONS[issue.severity];
                    return (
                      <div 
                        key={issue.id}
                        className="flex items-start gap-2 p-2 rounded-md bg-muted/30"
                      >
                        <SeverityIcon className={cn('h-4 w-4 mt-0.5 flex-shrink-0', SEVERITY_COLORS[issue.severity])} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">{issue.message}</p>
                        </div>
                        {issue.link && (
                          <Link to={issue.link}>
                            <Button size="sm" variant="ghost" className="h-6 px-2">
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* No Issues */}
            {dimension.issues.length === 0 && (
              <div className="pl-12 flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="h-4 w-4" />
                <span>No issues detected in this dimension</span>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
