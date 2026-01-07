import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw,
  Shield,
  Users,
  CheckSquare,
  Mail,
  FileText,
  Layers
} from 'lucide-react';
import { StageQualityResult, QualityCheck, QualityStatus } from '@/hooks/useStageQualityCheck';

interface StageQualityPanelProps {
  result: StageQualityResult | null;
  isLoading: boolean;
  onRefresh?: () => void;
}

const STATUS_ICONS: Record<QualityStatus, React.ReactNode> = {
  pass: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  warn: <AlertTriangle className="h-4 w-4 text-amber-600" />,
  fail: <XCircle className="h-4 w-4 text-red-600" />
};

const STATUS_COLORS: Record<QualityStatus, string> = {
  pass: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  warn: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  fail: 'bg-red-500/10 text-red-700 border-red-500/20'
};

const STATUS_LABELS: Record<QualityStatus, string> = {
  pass: 'Passing',
  warn: 'Warnings',
  fail: 'Failing'
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  structure: <Layers className="h-4 w-4" />,
  team_tasks: <Users className="h-4 w-4" />,
  client_tasks: <CheckSquare className="h-4 w-4" />,
  emails: <Mail className="h-4 w-4" />,
  documents: <FileText className="h-4 w-4" />,
  certified: <Shield className="h-4 w-4" />
};

const CATEGORY_LABELS: Record<string, string> = {
  structure: 'Structure',
  team_tasks: 'Team Tasks',
  client_tasks: 'Client Tasks',
  emails: 'Emails',
  documents: 'Documents',
  certified: 'Certification'
};

export function StageQualityPanel({ result, isLoading, onRefresh }: StageQualityPanelProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Quality Check
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Quality Check
            </CardTitle>
            {onRefresh && (
              <Button variant="ghost" size="sm" onClick={onRefresh}>
                <RefreshCw className="h-3 w-3" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Unable to compute quality checks.</p>
        </CardContent>
      </Card>
    );
  }

  // Group checks by category
  const checksByCategory = result.checks.reduce<Record<string, QualityCheck[]>>((acc, check) => {
    if (!acc[check.category]) {
      acc[check.category] = [];
    }
    acc[check.category].push(check);
    return acc;
  }, {});

  const categoryOrder = ['structure', 'team_tasks', 'client_tasks', 'emails', 'documents', 'certified'];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Quality Check
          </CardTitle>
          <div className="flex items-center gap-2">
            {onRefresh && (
              <Button variant="ghost" size="sm" onClick={onRefresh} className="h-7 w-7 p-0">
                <RefreshCw className="h-3 w-3" />
              </Button>
            )}
            <Badge className={STATUS_COLORS[result.status]}>
              {STATUS_ICONS[result.status]}
              <span className="ml-1">{STATUS_LABELS[result.status]}</span>
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary stats */}
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle2 className="h-3 w-3" />
            {result.passCount} pass
          </span>
          {result.warnCount > 0 && (
            <span className="flex items-center gap-1 text-amber-600">
              <AlertTriangle className="h-3 w-3" />
              {result.warnCount} warn
            </span>
          )}
          {result.failCount > 0 && (
            <span className="flex items-center gap-1 text-red-600">
              <XCircle className="h-3 w-3" />
              {result.failCount} fail
            </span>
          )}
        </div>

        {/* Checks by category */}
        <div className="space-y-3">
          {categoryOrder.map((category) => {
            const checks = checksByCategory[category];
            if (!checks || checks.length === 0) return null;

            return (
              <div key={category} className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  {CATEGORY_ICONS[category]}
                  <span>{CATEGORY_LABELS[category]}</span>
                </div>
                <div className="space-y-1 pl-6">
                  {checks.map((check) => (
                    <div 
                      key={check.check_key} 
                      className="flex items-start gap-2 text-xs"
                    >
                      {STATUS_ICONS[check.status]}
                      <span className={check.status === 'pass' ? 'text-muted-foreground' : ''}>
                        {check.message}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// Compact badge version for list views
export function StageQualityBadge({ status }: { status: QualityStatus | null }) {
  if (!status) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/50 mr-1" />
        --
      </Badge>
    );
  }

  return (
    <Badge className={`${STATUS_COLORS[status]} text-xs px-1.5`}>
      {STATUS_ICONS[status]}
    </Badge>
  );
}
