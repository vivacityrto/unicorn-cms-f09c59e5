import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useRBAC } from '@/hooks/useRBAC';
import { useEosHealthCheck, HealthCheck } from '@/hooks/useEosHealthCheck';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Loader2, 
  Download, 
  RefreshCw,
  ChevronDown,
  AlertTriangle,
  Shield,
  Database,
  FileCheck,
  Settings2
} from 'lucide-react';
import { toast } from 'sonner';

const categoryIcons: Record<string, React.ReactNode> = {
  config: <Settings2 className="h-4 w-4" />,
  read: <Database className="h-4 w-4" />,
  write: <FileCheck className="h-4 w-4" />,
  rls: <Shield className="h-4 w-4" />,
  enum: <AlertTriangle className="h-4 w-4" />,
};

const categoryLabels: Record<string, string> = {
  config: 'Configuration',
  read: 'Read Access',
  write: 'Write Access',
  rls: 'RLS Policies',
  enum: 'Enum Validation',
};

function StatusIcon({ status }: { status: HealthCheck['status'] }) {
  switch (status) {
    case 'pass':
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case 'fail':
      return <XCircle className="h-5 w-5 text-red-500" />;
    case 'running':
      return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
    case 'skipped':
      return <Clock className="h-5 w-5 text-muted-foreground" />;
    default:
      return <Clock className="h-5 w-5 text-muted-foreground" />;
  }
}

function StatusBadge({ status }: { status: HealthCheck['status'] }) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    pass: 'default',
    fail: 'destructive',
    running: 'secondary',
    pending: 'outline',
    skipped: 'outline',
  };
  
  return (
    <Badge variant={variants[status] || 'outline'} className="capitalize">
      {status}
    </Badge>
  );
}

function CheckRow({ check }: { check: HealthCheck }) {
  return (
    <Collapsible>
      <div className="flex items-center justify-between py-3 px-4 border-b last:border-b-0 hover:bg-muted/50">
        <div className="flex items-center gap-3">
          <StatusIcon status={check.status} />
          <div>
            <p className="font-medium text-sm">{check.name}</p>
            {check.duration !== undefined && (
              <p className="text-xs text-muted-foreground">{check.duration}ms</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={check.status} />
          {(check.message || check.details) && (
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
          )}
        </div>
      </div>
      {(check.message || check.details) && (
        <CollapsibleContent>
          <div className="px-4 py-2 bg-muted/30 text-sm">
            {check.message && (
              <p className="text-red-600 dark:text-red-400">{check.message}</p>
            )}
            {check.details && (
              <p className="text-muted-foreground">{check.details}</p>
            )}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

export default function EosHealthCheck() {
  const navigate = useNavigate();
  const { canAccessEOS, isVivacityTeam } = useRBAC();
  const {
    checks,
    isRunning,
    runWriteTests,
    setRunWriteTests,
    runAllChecks,
    exportResults,
    lastRun,
    summary,
  } = useEosHealthCheck();

  // Redirect non-Vivacity users
  useEffect(() => {
    if (!canAccessEOS()) {
      toast.error('EOS Health Check is available to the Vivacity Team only');
      navigate('/dashboard');
    }
  }, [canAccessEOS, navigate]);

  // Auto-run checks on mount
  useEffect(() => {
    if (isVivacityTeam && !lastRun) {
      runAllChecks();
    }
  }, [isVivacityTeam, lastRun, runAllChecks]);

  // Group checks by category
  const groupedChecks = checks.reduce((acc, check) => {
    if (!acc[check.category]) {
      acc[check.category] = [];
    }
    acc[check.category].push(check);
    return acc;
  }, {} as Record<string, HealthCheck[]>);

  const allPassed = summary.failed === 0 && summary.passed > 0;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              EOS Health Check
            </h1>
            <p className="text-muted-foreground mt-1">
              Diagnostic checks for EOS system integrity
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={exportResults}
              disabled={isRunning || summary.passed === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Export JSON
            </Button>
            <Button
              onClick={runAllChecks}
              disabled={isRunning}
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {isRunning ? 'Running...' : 'Run All Checks'}
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-4xl font-bold">{summary.total}</p>
                <p className="text-sm text-muted-foreground">Total Checks</p>
              </div>
            </CardContent>
          </Card>
          <Card className={allPassed ? 'border-green-500' : ''}>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-4xl font-bold text-green-500">{summary.passed}</p>
                <p className="text-sm text-muted-foreground">Passed</p>
              </div>
            </CardContent>
          </Card>
          <Card className={summary.failed > 0 ? 'border-red-500' : ''}>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-4xl font-bold text-red-500">{summary.failed}</p>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-4xl font-bold text-muted-foreground">{summary.pending}</p>
                <p className="text-sm text-muted-foreground">Pending</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Write Tests Toggle */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="write-tests" className="text-base font-medium">
                  Enable Write Tests
                </Label>
                <p className="text-sm text-muted-foreground">
                  Creates temporary test records, then deletes them. Safe but requires write permissions.
                </p>
              </div>
              <Switch
                id="write-tests"
                checked={runWriteTests}
                onCheckedChange={setRunWriteTests}
                disabled={isRunning}
              />
            </div>
          </CardContent>
        </Card>

        {/* Check Results by Category */}
        {Object.entries(groupedChecks).map(([category, categoryChecks]) => (
          <Card key={category}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                {categoryIcons[category]}
                {categoryLabels[category] || category}
              </CardTitle>
              <CardDescription>
                {categoryChecks.filter(c => c.status === 'pass').length} / {categoryChecks.length} passed
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {categoryChecks.map((check) => (
                  <CheckRow key={check.id} check={check} />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Last Run Info */}
        {lastRun && (
          <p className="text-sm text-muted-foreground text-center">
            Last run: {lastRun.toLocaleString()}
          </p>
        )}
      </div>
    </DashboardLayout>
  );
}
